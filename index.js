#!/usr/bin/env node

let sonar = require('./lib/sonar');

if (process.env.RABBIT_URL === undefined) {
  console.error('Missing rabbit URL');
  process.exit(1);
}

sonar.connect(process.env.RABBIT_URL).then((conn) => {
  let opts = {
    service: 'raspi-sonar',
  };
  //sonar.pinger(conn, 'raspi-sonar.ping', opts);
  sonar.listen(conn, 'raspi-sonar.ping');
}).then(null, console.warn);
