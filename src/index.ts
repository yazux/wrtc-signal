import { Server } from './server';

(async function () {
  const server = new Server();
  await server.initialize();
  server.listen(port => console.log(`Server is listening on port ${port}`))
})()

