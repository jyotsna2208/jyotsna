
if (!process.env.DEBUG)
  process.env.DEBUG = "gc:*";

var GridControl = require('./src/');

if (require.main === module) {
  var conf = {};

  if (process.env.GRID)
    conf.namespace = process.env.GRID;
  if (process.env.API_PORT)
    conf.peer_api_port = process.env.API_PORT;

  var grid = new GridControl(conf);

  grid.start();
}

module.exports = GridControl;

module.exports.client = require('./grid-api/');

//var Tools = require('./src/lib/tools.js');
//Tools.readConf(function(err, conf) {
