FROM node:20

WORKDIR /var/www

COPY . .

RUN npm install -g nodemon ts-node@10.9.1 typescript@5.1.6 @types/node@20.4.1
RUN npm install

EXPOSE ${APP_PORT}
CMD ["npm", "run", "prod"]