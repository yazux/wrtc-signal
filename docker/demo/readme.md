``` shell
docker-compose -p demo -f docker/demo/docker-compose.yml up -d --build
docker exec -it chat1 /bin/bash
docker exec -it chat2 /bin/bash
```