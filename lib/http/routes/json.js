/*!
 * kue - http - routes - json
 * Copyright (c) 2011 LearnBoost <tj@learnboost.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var Queue = require('../../kue')
  , JSV = require('JSV').JSV
  , Job = require('../../queue/job')
  , reds = require('reds')
  , filed = require('filed')
  , _ = require('lodash')
  , queue = new Queue
  , jsvEnv = JSV.createEnvironment();


/**
 * Search instance.
 */

var search;
function getSearch() {
  if (search) return search;
  reds.createClient = require('../../redis').createClient;
  return search = reds.createSearch('q:search');
};

/**
 * Get statistics including:
 *
 *   - inactive count
 *   - active count
 *   - complete count
 *   - failed count
 *   - delayed count
 *
 */

exports.stats = function(req, res){
  get(queue)
    ('inactiveCount')
    ('completeCount')
    ('activeCount')
    ('failedCount')
    ('delayedCount')
    ('workTime')
    (function(err, obj){
      if (err) return res.send({ error: err.message });
      res.send(obj);
    });
};

/**
 * Get job types.
 */

exports.types = function(req, res){
  queue.types(function(err, types){
    if (err) return res.send({ error: err.message });
    res.send(types);
  });
};

/**
 * Get jobs by range :from..:to.
 */

exports.jobRange = function(req, res){
  var state = req.params.state
    , from = parseInt(req.params.from, 10)
    , to = parseInt(req.params.to, 10)
    , order = req.params.order;

  Job.range(from, to, order, function(err, jobs){
    if (err) return res.send({ error: err.message });
    res.send(jobs);
  });
};

/**
 * Get jobs by :state, and range :from..:to.
 */

exports.jobStateRange = function(req, res){
  var state = req.params.state
    , from = parseInt(req.params.from, 10)
    , to = parseInt(req.params.to, 10)
    , order = req.params.order;

  Job.rangeByState(state, from, to, order, function(err, jobs){
    if (err) return res.send({ error: err.message });
    res.send(jobs);
  });
};

/**
 * Get jobs by :type, :state, and range :from..:to.
 */

exports.jobTypeRange = function(req, res){
  var type = req.params.type
    , state = req.params.state
    , from = parseInt(req.params.from, 10)
    , to = parseInt(req.params.to, 10)
    , order = req.params.order;

  Job.rangeByType(type, state, from, to, order, function(err, jobs){
    if (err) return res.send({ error: err.message });
    res.send(jobs);
  });
};

/**
 * Get job by :id.
 */

exports.job = function(req, res){
  var id = req.params.id;
  Job.get(id, function(err, job){
    if (err) return res.send({ error: err.message }, 404);
    if (job._state === 'complete'){
      res.redirect(303, req.path + '/output');
    } else {
      res.send(_.omit(job, 'output'));
    }
  });
};

/**
 * Get job output by :id.
 */

exports.output = function(req, res){
  var id = req.params.id, stream, output, file, path;
  Job.get(id, function(err, job){
    if (err) return res.send({ error: err.message }, 404);
    output = job.output || {};
    file = output.file;
    path = output.path;
    if(file){
      filed(file)
        .pipe(res);
    } else if(path){
      res.redirect(302, path);
    } else {
      res.send(output);
    }
  });
};

/**
 * Create a job.
 */

exports.createJob = function(req, res) {
  var body = req.body, validation, job, options, jobLoc, port;

  validation = queue.validate(body.type, body);

  if(!validation){
    return res.send({ errors: [{message: 'Must provide a valid job type'}] }, 400);
  }

  if(validation && validation.errors && validation.errors.length){
    return res.send({errors: [{message: 'Input parameters could not be validated'}]}, 400)
  }

  job = new Job(body.type, body || {});
  options = body.options || {};

  if (options.attempts) job.attempts(parseInt(options.attempts));
  if (options.priority) job.priority(options.priority);
  if (options.delay) job.delay(options.delay);

  job.save(function(err) {
    if (err) return res.send({ errors: [{message: err.message}] }, 500);
    port = req.app.get('port');
    jobLoc = req.protocol + "://" + req.host + ((port) ? ':' + port : '') + req.url + '/' + job.id;
    res.set('Content-Location', jobLoc)
    res.send({
      state: job._state,
      message: 'job accepted',
      id: job.id,
      _links: [{'self': {'href': jobLoc}}]
    }, 202);
  });

};

/**
 * Remove job :id.
 */

exports.remove = function(req, res){
  var id = req.params.id;
  Job.remove(id, function(err){
    if (err) return res.send({ error: err.message });
    res.send({ message: 'job ' + id + ' removed' });
  });
};

/**
 * Update job :id :priority.
 */

exports.updatePriority = function(req, res){
  var id = req.params.id
    , priority = parseInt(req.params.priority, 10);

  if (isNaN(priority)) return res.send({ error: 'invalid priority' });
  Job.get(id, function(err, job){
    if (err) return res.send({ error: err.message });
    job.priority(priority);
    job.save(function(err){
      if (err) return res.send({ error: err.message });
      res.send({ message: 'updated priority' });
    });
  });
};

/**
 * Update job :id :state.
 */

exports.updateState = function(req, res){
  var id = req.params.id
    , state = req.params.state;

  Job.get(id, function(err, job){
    if (err) return res.send({ error: err.message });
    job.state(state);
    job.save(function(err){
      if (err) return res.send({ error: err.message });
      res.send({ message: 'updated state' });
    });
  });
};

/**
 * Search and respond with ids.
 */

exports.search = function(req, res){
  getSearch().query(req.query.q).end(function(err, ids){
    if (err) return res.send({ error: err.message });
    res.send(ids);
  });
};

/**
 * Get log for job :id.
 */

exports.log = function(req, res){
  var id = req.params.id;
  Job.log(id, function(err, log){
    if (err) return res.send({ error: err.message });
    res.send(log);
  });
};

/**
 * Data fetching helper.
 */

function get(obj) {
  var pending = 0
    , res = {}
    , callback
    , done;

  return function _(arg){
    switch (typeof arg) {
      case 'function':
        callback = arg;
        break;
      case 'string':
        ++pending;
        obj[arg](function(err, val){
          if (done) return;
          if (err) return done = true, callback(err);
          res[arg] = val;
          --pending || callback(null, res);
        });
        break;
    }
    return _;
  };
}
