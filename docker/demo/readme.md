## You should make .env file (see .env.example)

## snippets
``` shell
# run containers
docker-compose -p chat-demo -f docker/demo/docker-compose.yml up -d --build

# application instances console
docker exec -it chat1 /bin/bash
docker exec -it chat2 /bin/bash
```