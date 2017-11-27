#!/usr/bin/env node

let os = require('os');
let sonar = require('./lib/sonar');

if (process.env.RABBIT_URL === undefined) {
  console.error('Missing rabbit URL');
  process.exit(1);
}

sonar.connect(process.env.RABBIT_URL).then((conn) => {
  let opts = {
    'name': 'raspi-sonar',
    'host': os.hostname()
  };
  //sonar.ping(conn, 'raspi-sonar.ping', JSON.stringify(opts));
  sonar.listen(conn, 'raspi-sonar.ping');
}).then(null, console.warn);
