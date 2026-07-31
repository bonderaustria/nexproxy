---
outline: deep
---

# Full Setup Instructions

## Running the App

Create a `docker-compose.yml` file:

```yml
services:
  app:
    image: 'ghcr.io/bonderaustria/nexproxy:latest'
    restart: unless-stopped

    ports:
      # These ports are in format <host-port>:<container-port>
      - '80:80' # Public HTTP Port
      - '443:443' # Public HTTPS Port
      - '81:81' # Admin Web Port
      # Add any other Stream port you want to expose
      # - '21:21' # FTP

    environment:
      TZ: "Europe/Vienna"

      # Uncomment this if you want to change the location of
      # the SQLite DB file within the container
      # DB_SQLITE_FILE: "/data/database.sqlite"

      # Uncomment this if IPv6 is not enabled on your host
      # DISABLE_IPV6: 'true'

    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

Then:

```bash
docker compose up -d
```

## Using PostgreSQL

Instead of the built-in SQLite database you can run NexProxy against PostgreSQL — recommended for multiple nodes, and required for high availability:

```yml
services:
  app:
    image: 'ghcr.io/bonderaustria/nexproxy:latest'
    restart: unless-stopped
    ports:
      # These ports are in format <host-port>:<container-port>
      - '80:80' # Public HTTP Port
      - '443:443' # Public HTTPS Port
      - '81:81' # Admin Web Port
      # Add any other Stream port you want to expose
      # - '21:21' # FTP
    environment:
      TZ: "Europe/Vienna"
      # Postgres parameters:
      DB_POSTGRES_HOST: 'db'
      DB_POSTGRES_PORT: '5432'
      DB_POSTGRES_USER: 'npm'
      DB_POSTGRES_PASSWORD: 'npmpass'
      DB_POSTGRES_NAME: 'npm'
      # Uncomment this if IPv6 is not enabled on your host
      # DISABLE_IPV6: 'true'
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
    depends_on:
      - db

  db:
    image: postgres:17
    environment:
      POSTGRES_USER: 'npm'
      POSTGRES_PASSWORD: 'npmpass'
      POSTGRES_DB: 'npm'
    volumes:
      - ./postgres_data:/var/lib/postgresql/data
```

::: warning

Custom Postgres schema is not supported, as such `public` will be used.

:::

## Running on Raspberry PI / ARM devices

The docker images support the following architectures:
- amd64
- arm64

::: warning
`armv7` is no longer supported in version 2.14+. This is due to Nodejs dropping support for armhf. Please
use the `2.13.7` image tag if this applies to you.
:::

The docker images are a manifest of all the architecture docker builds supported, so this means
you don't have to worry about doing anything special and you can follow the common instructions above.

Check out the [dockerhub tags](https://hub.docker.com/r/ghcr.io/bonderaustria/nexproxy/tags)
for a list of supported architectures and if you want one that doesn't exist,
[create a feature request](https://github.com/bonderaustria/nexproxy/issues/new?assignees=&labels=enhancement&template=feature_request.md&title=).

Also, if you don't know how to already, follow [this guide to install docker and docker-compose](https://manre-universe.net/how-to-run-docker-and-docker-compose-on-raspbian/)
on Raspbian.

## Initial Run

After the app is running for the first time, the following will happen:

1. JWT keys will be generated and saved in the data folder
2. The database will initialize with table structures
3. A default admin user will be created

This process can take a couple of minutes depending on your machine.
