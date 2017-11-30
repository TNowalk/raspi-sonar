let amqp = require('amqplib/callback_api');
let os = require('os');

class Sonar {
  constructor() {
    this.conn = null;
    this.exchange = 'raspi-sonar.ping';
    this.noop = () => {};
  }

  handleError(err) {
    console.error(err);
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (process.env.RABBIT_URL === undefined) {
        reject('[AMQP] Missing rabbit URL');
        this.handleError('[AMQP] Missing rabbit URL');
      } else {
        amqp.connect(process.env.RABBIT_URL, (err, conn) => {
          if (err) {
            reject(`[AMQP] ${err.message}`);
            this.handleError("[AMQP]" +  err.message);
          }
          this.conn = conn;
          resolve(this.conn);
        });
      }
    });
  }

  pinger(opts) {
    let interval = opts.interval || 30000;
    let msg = JSON.stringify({
      cpuUsage: opts.process.cpuUsage(),
      hostname: os.hostname(),
      interval,
      memoryUsage: opts.process.memoryUsage(),
      routingKey: this.exchange,
      service: opts.service,
      uptime: opts.process.uptime()
    });
    this.conn.createChannel((err, ch) => {
      ch.assertExchange(this.exchange, 'direct', {durable: false}, (exErr) => {
	    // Send initial ping
        console.log(' [x] Sent', msg);
        ch.publish(this.exchange, 'info', Buffer.from(msg));
	    setInterval(() => {
	      console.log(' [x] Sent', msg);
	      ch.publish(this.exchange, 'info', Buffer.from(msg));
	    }, interval);
      });
    });
  }

  listen(cb) {
    let callback = cb || this.noop;
    this.conn.createChannel((err, ch) => {
      ch.assertExchange(this.exchange, 'direct', {durable: false}, (exErr) => {
        ch.assertQueue('', {exclusive: true}, (qErr, ok) => {
          let queue = ok.queue;
          ch.bindQueue(queue, this.exchange, 'info');
          console.info(" [*] Waiting for messages in %s. To exit press CTRL+C", this.exchange);
          ch.consume(queue, (msg) => {
            console.log(" [x] Received %s", msg.content.toString());
              callback(msg.content.toString());
          }, {noAck: true});
        });
      });
    });
  }
}

module.exports = new Sonar();
