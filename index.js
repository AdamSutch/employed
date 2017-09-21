const axios = require('axios');
const NeDB = require('nedb');
const path = require('path');
const cron = require('node-cron');
const Promise = require('bluebird');
const R = require('ramda');

const token = process.env.GITHUB_TOKEN;
const company = process.env.GITHUB_ORG;
const pushbulletToken = process.env.PUSHBULLET_TOKEN;

// Make our db and load it
const db = Promise.promisifyAll(
  new NeDB({
    filename: path.resolve(__dirname, 'db/employees.db'),
    autoload: true,
  }),
);

// Get a users info by login name
const getUser = login =>
  axios({
    method: 'get',
    url: `https://api.github.com/users/${login}`,
    responseType: 'json',
    headers: {
      Authorization: `token ${token}`,
    },
  }).then(result => result.data);

// Best guess at the users name
const getUserName = user =>
  R.propOr(false, 'name', user) || R.propOr(false, 'login', user) || 'No idea';

// Send a Pushbullet notification
const notify = (title, body) =>
  axios({
    method: 'post',
    url: 'https://api.pushbullet.com/v2/pushes',
    responseType: 'json',
    headers: {
      'Access-Token': pushbulletToken,
      'Content-Type': 'application/json',
    },
    data: {
      body,
      title,
      type: 'note',
    },
  });

// Check if an employee has been added or removed
const checkEmployment = () =>
  // Get a list of users
  Promise.try(() =>
    axios({
      method: 'get',
      url: `https://api.github.com/orgs/${company}/members`,
      responseType: 'json',
      headers: {
        Authorization: `token ${token}`,
      },
    }).then(result => result.data),
  )
    // Check if any new users have been added
    .each(user =>
      db.findAsync({id: user.id}).then(doc => {
        if (R.isEmpty(doc)) {
          // Add to db is missing and notify
          return getUser(user.login).then(newUser =>
            db
              .insertAsync(newUser)
              .then(doc => notify('New employee', getUserName(doc))),
          );
        }
      }),
    )
    // Check if any users are missing
    .then(users =>
      // Remove them from the db and notify
      db
        .findAsync({id: {$nin: users.map(user => user.id)}})
        .map(user =>
          getUser(user.login).then(missingUser =>
            db
              .removeAsync({id: user.id})
              .then(doc => notify('Missing employee', getUserName(doc))),
          ),
        ),
    );

// Check once on startup
checkEmployment();

// Check every 10 minutes
const tenMinutes = '*/10 * * * *';
cron.schedule(tenMinutes, () => checkEmployment());
