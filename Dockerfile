# Approx 25MB ram
# Can be replaced with alpine once it supports Arm (because I run this on a RPI)
FROM node:8

RUN mkdir -p /data/
WORKDIR /data/

COPY package.json .
COPY package-lock.json .
RUN npm install
COPY . .

VOLUME /data/db/

CMD ["npm", "start"]
