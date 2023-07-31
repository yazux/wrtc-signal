## You should make .env file (see .env.example)

## snippets
``` shell
# run containers
docker-compose -p chat-local -f docker/local/docker-compose.yml up -d --build

# application instances console
docker exec -it chat1 /bin/bash
docker exec -it chat2 /bin/bash
```