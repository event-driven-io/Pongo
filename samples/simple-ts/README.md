[![](https://dcbadge.vercel.app/api/server/fTpqUTMmVa?style=flat)](https://discord.gg/kHkSThjG) [<img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" height="20px" />](https://www.linkedin.com/in/oskardudycz/) [![Github Sponsors](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&link=https://github.com/sponsors/oskardudycz/)](https://github.com/sponsors/oskardudycz/) [![blog](https://img.shields.io/badge/blog-event--driven.io-brightgreen)](https://event-driven.io/?utm_source=event_sourcing_nodejs) [![blog](https://img.shields.io/badge/%F0%9F%9A%80-Architecture%20Weekly-important)](https://www.architecture-weekly.com/?utm_source=event_sourcing_nodejs)

![](./docs/public/logo.png)

# Emmett - Sample showing event-sourced WebApi with Express.js and EventStoreDB

Read more in [Emmett getting started guide](https://event-driven-io.github.io/emmett/getting-started.html).

## Prerequisities

Sample require EventStoreDB, you can start it by running

```bash
docker-compose up
```

You need to install packages with

```bash
npm install
```

## Running

Just run

```bash
npm run start
```

## Running inside Docker

To build application:

```bash
docker-compose --profile app build
```

To run application:

```bash
docker-compose --profile app up
```

### Testing

You can either run tests with

```
npm run test
```

Or manually with prepared [.http](.http) file
