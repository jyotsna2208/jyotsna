
var grid = require('grid-api').init({
  instances   : 1,
  env         : {
    NODE_ENV  : 'development'
  }
});

function triggerGetIp() {
  grid.exec('get-ip', function(err, data, server) {
    if (err) {
      console.log(err);
      return false;
    }
	  console.log('Got response from server pub_ip=(%s) priv_ip=(%s):',
                server.public_ip,
                server.private_ip);
    console.log(data);
  });
}

function triggerEcho() {
  grid.exec('echo.return', {
    name : 'Thingy Thing'
  }, function(err, data, server) {
    if (err) {
      console.log(err);
      return false;
    }
    console.log('Got response from server pub_ip=(%s) priv_ip=(%s):',
                server.public_ip,
                server.private_ip);
    console.log(data);
  });
}

grid.on('ready', function() {
  console.log('Gridcontrol Ready');
  setInterval(triggerEcho, 1000);
});
