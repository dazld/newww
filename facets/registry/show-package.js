var async = require('async'),
    moment = require('moment'),
    presentPackage = require('./presenters/package'),
    validatePackageName = require('validate-npm-package-name');

function showPackage(request, reply) {
  var getPackage = request.server.methods.registry.getPackage,
      getDownloadData = request.server.methods.downloads.getAllDownloadsForPackage;

  if (request.params.version) {
    return reply.redirect('/package/' + request.params.package);
  }

  var opts = { };

  request.timing.page = 'showPackage';
  request.metrics.metric({ name: 'showPackage', package: request.params.package, value: 1 });

  opts.name = request.params.package;

  getPackage(opts.name, function (er, pkg) {

    opts.package = { name: opts.name };
    if (er) {
      request.logger.error(er, 'fetching package ' + opts.name);
      return reply.view('errors/internal', opts).code(500);
    }

    if (!pkg) {
      if (!validatePackageName(opts.name).valid) {
        delete opts.package; // to suppress the encouraging message
        request.logger.info('request for invalid package name: ' + opts.name);
        reply.view('errors/not-found', opts).code(404);
        return;
      }

      return reply.view('errors/not-found', opts).code(404);
    }

    if (pkg.time && pkg.time.unpublished) {

      var t = pkg.time.unpublished.time;
      pkg.unpubFromNow = moment(t).format('ddd MMM DD YYYY HH:mm:ss Z');
      opts.package = pkg;
      request.timing.page = 'showUnpublishedPackage';

      return reply.view('registry/unpublished-package-page', opts).code(410);
    }

    var tasks = {
      dependents: function(cb) { fetchDependents(request, opts.name, cb); },
      downloads: function(cb) { getDownloadData(opts.name, cb); },
    };

    async.parallel(tasks, function(err, results) {

      if (err) {
        // this really shouldn't happen! but we defend against it if it does.
        pkg.dependents = [];
        pkg.downloads = false;
      } else {

        if (Array.isArray(results.downloads)) {
          pkg.downloads = results.downloads[0];
        } else {
          pkg.downloads = results.downloads;
        }

        pkg.dependents = results.dependents;
      }

      presentPackage(request, pkg, function (er, cleanedPackage) {
        if (er) {
          request.logger.info(er, 'presentPackage() responded with error; package=' + opts.name);
          reply.view('errors/internal', opts).code(500);
          return;
        }

        var loggedInUser = request.auth.credentials;

        cleanedPackage.isStarred = loggedInUser && cleanedPackage.users && cleanedPackage.users[loggedInUser.name] || false;
        opts.package = cleanedPackage;
        opts.title = cleanedPackage.name;
        reply.view('registry/package-page', opts);
      });
    });
  });
}

function fetchDependents(request, name, callback) {

  var getBrowseData = request.server.methods.registry.getBrowseData;
  var results = [];
  request.timing.browse_start = Date.now();

  getBrowseData('depended', name, 0, 1000, true, function (er, dependents) {

    request.metrics.metric({
      name:   'latency',
      value:  Date.now() - request.timing.browse_start,
      type:   'couchdb',
      browse: 'depended'
    });

    if (er) {
      var msg = 'unable to get depended browse data; package=' + name;
      request.logger.error(msg);
      request.logger.error(er);
      request.metrics.metric({
        name:    'error',
        message: msg,
        value:   1,
        type:    'couchdb'
      });
    } else {
      results = dependents;
    }

    callback(null, results);
  });
}

module.exports = showPackage;
showPackage.fetchDependents = fetchDependents;
