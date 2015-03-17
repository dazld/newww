var Boom = require('boom');
var murmurhash = require('murmurhash');
var crypto = require('crypto');
var fixtures = require('../fixtures.js');
var Promise = require('bluebird');
var assert = require('assert');

module.exports = function (server) {
  var methods = {

    corp: {
      getPage: function (name, next) {
        if (name === 'jobs') {
          return next(null, "<h1 id='jobs'>JOBS</h1>");
        }

        return next(new Error('OMGBOOM'));
      },

      getPolicy: function (name, next) {
        if (fixtures.policies[name]) {
          return next(null, fixtures.policies[name]);
        }

        return next(new Error('Not Found'));
      }
    },
    
    email: {
      send: function (template, user, redis) {
        assert(typeof redis === 'object', 'whoops need redis');
        return new Promise(function (resolve, reject) {
          return resolve(null);
        });
      }
    },

    npme: {
      createCustomer: function (data, next) {
        return next(null, fixtures.enterprise.newUser);
      },

      createLicense: function (licenseDetails, callback) {
        return callback(null, fixtures.enterprise.goodLicense[0]);
      },

      createTrial: function (customer, next) {
        return next(null, customer);
      },

      getCustomer: function (email, next) {
        var key = typeof(email) === 'string' ? email.split('@')[0] : email;

        switch (key) {
          case 'exists':
          case 123:
            // user already exists
            return next(null, fixtures.enterprise.existingUser);
          case 'new':
          case 345:
            // user doesn't exist yet
            return next(null, null);
          case 'noLicense':
            // for license testing
            return next(null, fixtures.enterprise.noLicenseUser);
          case 'badLicense':
            // for license testing
            return next(null, fixtures.enterprise.noLicenseUser);
          case 'tooManyLicenses':
            // for license testing
            return next(null, fixtures.enterprise.tooManyLicensesUser);
          case 'licenseBroken':
            // for license testing
            return next(null, fixtures.enterprise.licenseBrokenUser);
          default:
            // something went wrong with hubspot
            return next(new Error('something went wrong'));
        }
      },

      getLicense: function (productId, customerId, licenseId, next) {
        var key = customerId.split('@')[0];

        switch (key) {
          case 'badLicense':
            return next(null, null);
          case 'new':
            return next(null, fixtures.enterprise.newLicense[0]);
          case 'exists':
            return next(null, fixtures.enterprise.goodLicense[0]);
          default:
            return next(new Error('license machine brokened'));
        }
      },

      getLicenses: function (productId, customerId, next) {
        var key = customerId.split('@')[0];

        switch (key) {
          case 'noLicense':
            return next(null, fixtures.enterprise.noLicense);
          case 'tooManyLicenses':
            return next(null, fixtures.enterprise.tooManyLicenses);
          case 'exists':
            return next(null, fixtures.enterprise.goodLicense);
          default:
            return next(new Error('license machine brokened'));
        }
      },

      sendData: function (formID, data, next) {
        if (data.email.indexOf('error') !== -1) {
          return next(new Error('ruh roh broken'));
        }

        return next(null);
      },

      updateCustomer: function (customerId, data, callback) {
        return callback(null);
      },

      verifyTrial: function (verificationKey, next) {
        switch (verificationKey) {
          case '12345':
          case '12ab34cd-a123-4b56-789c-1de2f3ab45cd':
            return next(null, fixtures.enterprise.newTrial);
          case '23456':
            return next(null, fixtures.enterprise.noCustomerTrial);
          case 'noLicense':
            return next(null, fixtures.enterprise.noLicenseTrial);
          case 'tooManyLicenses':
            return next(null, fixtures.enterprise.tooManyLicensesTrial);
          case 'licenseBroken':
            return next(null, fixtures.enterprise.licenseBrokenTrial);
          default:
            return next(new Error('cannot verify trial'));
        }
      }
    },

    registry: {
      getBrowseData: function (type, arg, skip, limit, noPackageData, next) {

        if (typeof noPackageData === 'function') {
          next = noPackageData;
          noPackageData = false;
        }

        return next(null, fixtures.browse[type]);
      },

      getPackage: function (pkgName, next) {

        if (fixtures.packages[pkgName]) {
          return next(null, fixtures.packages[pkgName]);
        }

        if (fixtures.packages.benchmark[pkgName]) {
          return next(null, fixtures.packages.benchmark[pkgName]);
        }

        return next();
      },

      getAllPackages: function (skip, limit, next) {
        return next(null, fixtures.browse.all);
      },

      getAllByKeyword: function (arg, skip, limit, next) {
        return next(null, fixtures.browse.keyword);
      },

      getAuthors: function (arg, skip, limit, next) {
        return next(null, fixtures.browse.author);
      },

      getDependedUpon: function (arg, skip, limit, next) {
        return next(null, fixtures.browse.depended);
      },

      getStarredPackages: function (arg, skip, limit, next) {
        return next(null, fixtures.browse.star);
      },

      getUserStars: function (arg, skip, limit, next) {
        return next(null, fixtures.browse.userstar);
      },

      getUpdated: function (skip, limit, next) {
        return next(null, fixtures.browse.updated);
      },

      getRecentAuthors: function (arg, skip, limit, next) {
        return next(null, fixtures.browse.recentauthors);
      },

      packagesCreated: function (next) {
        return next(null, 0);
      },

      star: function (package, username, next) {
        return next(null, 'ok');
      },

      unstar: function (package, username, next) {
        return next(null, 'ok');
      }
    },

    user: {
      changeEmail: function (name, email, next) {
        if (name !== 'fakeusercouch') {
          return next(Boom.notFound('Username not found: ' + name));
        }

        fixtures.users.fakeusercouch.email = email;
        return next(null);
      },

      changePass: function (auth, next) {
        if (!fixtures.users[auth.name] || !fixtures.users[auth.name].salt) {
          return next(null);
        }

        fixtures.users[auth.name].derived_key = passHash(auth);
        return next(null);
      },

      delSession: function (request) {
        return function (user, next) {
          var sid = murmurhash.v3(user.name, 55).toString(16);

          user.sid = sid;

          request.server.app.cache.drop(sid, function (err) {
            if (err) {
              return next(Boom.internal('there was an error clearing the cache'));
            }

            request.auth.session.clear();
            return next(null);
          });
        };
      },

      getUser: function (username, next) {
        if (fixtures.users[username]) {
          return next(null, fixtures.users[username]);
        }

        return next(Boom.notFound('Username not found: ' + username));
      },

      loginUser: function (auth, next) {
        if (auth.name === 'fakeusercli') {
          return next(null, fixtures.users.fakeusercli);
        }

        if (auth.name !== 'fakeusercouch' || passHash(auth) !== fixtures.users.fakeusercouch.derived_key) {
          return next('Username and/or Password is wrong');
        }
        return next(null, fixtures.users.fakeusercouch);
      },

      lookupUserByEmail: function (email, next) {
        if (email === fixtures.users.fakeusercli.email) {
          return next(null, ['fakeusercli']);
        } else if (email === fixtures.users.fakeusercouch.email) {
          return next(null, ['fakeusercouch', 'fakeusercli']);
        } else {
          return next(null, []);
        }
      },

      saveProfile: function (user, next) {
        return next(null, "yep, it's cool");
      },

      setSession: function (request) {
        return function (user, next) {
          var sid = murmurhash.v3(user.name, 55).toString(16);

          user.sid = sid;

          server.app.cache.set(sid, user, 0, function (err) {
            if (err) {
              return next(Boom.internal('there was an error setting the cache'));
            }

            request.auth.session.set({sid: sid});
            return next(null);
          });
        };
      },

      signupUser: function (acct, next) {
        return next(null, fixtures.users.fakeusercli);
      }
    }
  };

  methods.registry.getPackage.cache = {
    drop: function (pkg, cb) {
      return cb(null, 200);
    }
  };

  methods.user.getUser.cache = {
    drop: function (pkg, cb) {
      return cb(null, 200);
    }
  };

  return methods;
};

function passHash (auth) {
  return crypto.pbkdf2Sync(auth.password, fixtures.users[auth.name].salt, fixtures.users[auth.name].iterations, 20).toString('hex');
}
