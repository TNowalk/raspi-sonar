let amqp = require('amqplib/callback_api');
let os = require('os');

class Sonar {
  constructor() {
    this.conn = null;
  }

  handleError(err) {
    console.error(err);
    process.exit(1);
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      amqp.connect(url, (err, conn) => {
        if (err) {
          reject(`[AMQP] ${err.message}`);
          this.handleError("[AMQP]" +  err.message);
        }
        this.conn = conn;
        resolve(this.conn);
      });
    });
  }

  pinger(conn, ex, opts) {
    let interval = opts.interval || 30000;
    let msg = JSON.stringify({
      hostname: os.hostname(),
      service: opts.service
    });
    conn.createChannel((err, ch) => {
      ch.assertExchange(ex, 'direct', {durable: false}, (exErr) => {
	// Send initial ping
        console.log(' [x] Sent', msg);
        ch.publish(ex, 'info', Buffer.from(msg));
	setInterval(() => {
	  console.log(' [x] Sent', msg);
	  ch.publish(ex, 'info', Buffer.from(msg));
	}, interval);
      });
    });
  }

  listen(conn, ex) {
    conn.createChannel((err, ch) => {
      ch.assertExchange(ex, 'direct', {durable: false}, (exErr) => {
        ch.assertQueue('', {exclusive: true}, (qErr, ok) => {
          let queue = ok.queue;
          ch.bindQueue(queue, ex, 'info');
          console.info(" [*] Waiting for messages in %s. To exit press CTRL+C", ex);
          ch.consume(queue, (msg) => {
            console.log(" [x] Received %s", msg.content.toString());
          }, {noAck: true});
        });
      });
    });
  }
}

module.exports = new Sonar();
