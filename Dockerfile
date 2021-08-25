FROM node:12-alpine

WORKDIR /usr/src/app

# Install dependencies
COPY package*.json /usr/src/app
RUN npm install --only=prod

COPY . /usr/src/app

CMD [ "npm", "start" ]
EXPOSE 9000
