
process.env.NODE_ENV  = 'test';
process.env.DEBUG     = 'gc:*';
process.env.GRID      = 'grid:name';
//process.env.GRID_AUTH = '123456';

var fs          = require('fs');
var gridcontrol = require('../index.js');
var should      = require('should');
var path        = require('path');
var request     = require('request');
var Plan        = require('./plan.js');

describe('Gridcontrol', function() {
  this.timeout(5000);

  var n1, n2, n3;
  var sync_file_size;

  describe('Init', function() {
    it('should create a first client', function() {
      n1 = new gridcontrol({
        peer_api_port : 10000
      });

      return n1.start();
    });

    it('should have the rigth namespace (via process.env.NS)', function(done) {
      should(n1.namespace).eql(process.env.GRID);
      done();
    });

    it('should connect second client', function(done) {
      var plan = new Plan(3, done);

      n2 = new gridcontrol({
        peer_api_port  : 11000,
        file_manager : {
          root_folder     : '/tmp/n2/',
          app_folder      : '/tmp/n2/app/'
        }
      });

      n2.once('ready', () => {
        plan.ok(true)
      });

      n1.once('confirmed:peer', () => {
        plan.ok(true)
      });

      n2.once('confirmed:peer', () => {
        plan.ok(true)
      });

      n2.start();
    });

    it('n1 should list 1 peer', function(done) {
      should(n1.getRouters().length).eql(1);
      done();
    });

    it('n2 should list 1 peer', function(done) {
      should(n2.getRouters().length).eql(1);
      setTimeout(done, 1000);
    });
  });

  describe.skip('Serialization', function() {
    var serial;

    it('should serialize n1', function(done) {
      serial = n1.serialize();
      //console.log(serial);
      done();
    });

    it('should stop n1', function(done) {
      n1.close(done);
    });

    it('should reinitialize n1 with same previous params', function() {
      n1 = new gridcontrol(serial);

      return n1.start();
    });
  });

  describe('API Interactions', function() {

    it('should webserver be started', function(done) {
      request.get('http://localhost:10000/ping', function(err, res, body) {
        should(err).be.null();
        should(res.statusCode).eql(200);
        body.should.eql('pong');
        done();
      });
    });

    it('should retrieve two host connected', function(done) {
      request.get('http://localhost:10000/hosts/list', function(e, r, b) {
        var dt = JSON.parse(b);
        should(e).be.null();
        should(r.statusCode).eql(200);
        should(dt.length).eql(2);
        dt[0].should.have.properties(['public_ip', 'private_ip', 'api_port', 'name', 'hostname', 'synchronized']);
        dt[0].synchronized.should.be.false();
        done();
      });
    });

    it('should retrieve 0 tasks started', function(done) {
      request.get('http://localhost:10000/tasks/list', function(err, res, body) {
        should(err).be.null();
        should(res.statusCode).eql(200);
        var tasks = JSON.parse(body);
        should(tasks.length).eql(0);
        done();
      });
    });

    it('should get configuration', function(done) {
      request.get('http://localhost:10000/conf', function(err, res, body) {
        should(err).be.null();
        should(res.statusCode).eql(200);
        var conf = JSON.parse(body);
        conf.should.have.properties(['file_manager', 'task_manager']);
        done();
      });
    });

    it('should start all fixtures tasks', function(done) {
      this.timeout(5000);
      var base_folder = path.join(__dirname, 'fixtures', 'app1');
      var task_folder = 'tasks';

      request.post('http://localhost:10000/tasks/init', {
        form : {
          base_folder : base_folder,
          task_folder : task_folder,
          instances   : 1,
          env         : {
            NODE_ENV : 'test'
          }
        }
      }, function(err, res, body) {
        var ret = JSON.parse(body);
        ret['echo'].task_id.should.eql('echo');
        ret['echo'].pm2_name.should.eql('task:echo');
        ret['ping'].task_id.should.eql('ping');

        n1.task_manager.getTasks().echo.port.should.eql(10001);

        done();
      });
    });

    it('should n2 synchronized and task started', function(done) {
      var plan = new Plan(2, done);

      n2.once('tasks_started', () => plan.ok(true));
      n2.once('synchronized', () => plan.ok(true));
    });

    it('should RESTART all fixtures tasks', function(done) {
      this.timeout(5000);
      var base_folder = path.join(__dirname, 'fixtures', 'app1');

      request.post('http://localhost:10000/tasks/init', {
        form : {
          base_folder : base_folder,
          task_folder : 'tasks',
          instances   : 1,
          env         : {
            NODE_ENV : 'test'
          }
        }
      }, function(err, res, body) {
        setTimeout(done, 1000);
      });
    });

    it('should NS1 retrieve 5 tasks started', function(done) {
      request.get('http://localhost:10000/tasks/list', function(err, res, body) {
        should(err).be.null();
        should(res.statusCode).eql(200);
        var tasks = JSON.parse(body);
        should(tasks.length).eql(5);
        done();
      });
    });

    // PM2 is not dameonized by NS2
    it('should NS2 retrieve 5 tasks started', function(done) {
      request.get('http://localhost:11000/tasks/list', function(err, res, body) {
        should(err).be.null();
        should(res.statusCode).eql(200);
        var tasks = JSON.parse(body);
        should(tasks.length).eql(5);
        done();
      });
    });

    it('should port of echo not incremented (stay 10001)', function() {
      n1.task_manager.getTasks().echo.port.should.eql(10001);
    });

    it('should n1 peers synchronized', function(done) {
      sync_file_size = fs.lstatSync('/tmp/n2/current-sync.tar.gz').size;
      fs.lstatSync('/tmp/n2/');
      done();
    });

    it('should master see n2 has synchronized', function(done) {
      request.get('http://localhost:10000/hosts/list', function(e, r, b) {
        var dt = JSON.parse(b);
        dt[0].synchronized.should.be.true();
        done();
      });
    });


    it('should trigger task', function(done) {
      request.post('http://localhost:10000/tasks/lb_trigger_single', {
        form : {
          task_id : 'echo',
          data : {
            name : 'yey'
          }
        }
      }, function(err, raw, body) {
        var res = JSON.parse(body);
        should(err).be.null();
        should(res.err).be.null();
        should.exist(res.server);
        res.data.hello.should.eql('yey');
        should(res.server.name).eql(n1.getLocalIdentity().name);
        return done();
      });
    });

    it('should trigger task', function(done) {
      request.post('http://localhost:10000/tasks/lb_trigger_single', {
        form : {
          task_id : 'echo',
          data : {
            name : 'yey'
          }
        }
      }, function(err, raw, body) {
        var res = JSON.parse(body);
        should(err).be.null();
        should(res.err).be.null();
        should.exist(res.server);
        res.data.hello.should.eql('yey');
        should(res.server.name).eql(n2.getLocalIdentity().name);
        return done();
      });
    });

    it.skip('should trigger task with custom env', function(done) {
      request.post('http://localhost:10000/tasks/lb_trigger_single', {
        form : {
          task_id : 'env',
          data : {}
        }
      }, function(err, raw, body) {
        should(err).be.null();
        console.log(err, body);
        var res = JSON.parse(body);
        console.log(res);
        //res.data.env.should.eql('test');
        done();
      });
    });
  });

  describe('Third node', function() {
    it('should connect THIRD node and wait for file to be sync', function(done) {
      var plan = new Plan(4, done);

      this.timeout(7000);

      n3 = new gridcontrol({
        peer_api_port  : 12000,
        file_manager : {
          root_folder     : '/tmp/n3/',
          app_folder      : '/tmp/n3/app/'
        }
      });

      // N1 should detect N3
      n1.once('confirmed:peer', function() {
        plan.ok(true);
      });

      // N2 should detect N3
      n2.once('confirmed:peer', function() {
        plan.ok(true);
      });

      // N3 should detect N1
      n3.once('confirmed:peer', function() {
        plan.ok(true);
      });

      // N3 should detect N2
      n3.once('confirmed:peer', function() {
        plan.ok(true);
      });

      n3.start();
    });

    it('should receive notification file sync finished', function(done) {
      n3.once('synchronized', function() {
        done();
      });
    });

    it('should now N1 retrieve three hosts connected', function(done) {
      request.get('http://localhost:10000/hosts/list', function(e, r, b) {
        var dt = JSON.parse(b);
        should(e).be.null();
        should(r.statusCode).eql(200);
        should(dt.length).eql(3);
        done();
      });
    });

    it('should now N2 retrieve two hosts connected', function(done) {
      request.get('http://localhost:11000/hosts/list', function(e, r, b) {
        var dt = JSON.parse(b);
        should(e).be.null();
        should(r.statusCode).eql(200);
        should(dt.length).eql(3);
        done();
      });
    });

    it('should now N3 retrieve two hosts connected', function(done) {
      request.get('http://localhost:12000/hosts/list', function(e, r, b) {
        var dt = JSON.parse(b);
        should(e).be.null();
        should(r.statusCode).eql(200);
        should(dt.length).eql(3);
        done();
      });
    });

    it('should N3 autosync because file already gen', function(done) {
      var stats = fs.lstatSync('/tmp/n3/current-sync.tar.gz');
      stats.size.should.eql(sync_file_size);
      fs.lstatSync('/tmp/n3/');
      done();
    });
  });

  describe('End commands', function() {
    it('should clear all tasks', function(done) {
      request.delete('http://localhost:10000/tasks/clear', function(err, raw, body) {
        done();
      });
    });

    it('should clear (file + api)', function(done) {
      n1.close(function() {
        n3.close(function() {
          n2.close(done);
        });
      });
    });
  });

});
