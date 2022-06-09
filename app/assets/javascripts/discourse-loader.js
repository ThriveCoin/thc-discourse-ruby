var define, requirejs;

(function () {
  var JS_MODULES = {};
  var ALIASES = {
    "ember-addons/ember-computed-decorators":
      "discourse-common/utils/decorators",
    "discourse/lib/raw-templates": "discourse-common/lib/raw-templates",
    "preload-store": "discourse/lib/preload-store",
    "fixtures/user_fixtures": "discourse/tests/fixtures/user-fixtures",
  };
  var ALIAS_PREPEND = {
    fixtures: "discourse/tests/",
    helpers: "discourse/tests/",
  };

  // In future versions of ember we don't need this
  if (typeof Ember !== "undefined") {
    JS_MODULES = {
      jquery: { default: $ },
      "@ember/array": {
        default: Ember.Array,
        A: Ember.A,
        isArray: Ember.isArray,
      },
      "@ember/array/proxy": {
        default: Ember.ArrayProxy,
      },
      "@ember/component": {
        default: Ember.Component,
      },
      "@ember/controller": {
        default: Ember.Controller,
        inject: Ember.inject.controller,
      },
      "@ember/debug": {
        assert: Ember.assert,
        runInDebug: Ember.runInDebug,
        warn: Ember.warn,
      },
      "@ember/object": {
        action: Ember._action,
        default: Ember.Object,
        get: Ember.get,
        getProperties: Ember.getProperties,
        set: Ember.set,
        setProperties: Ember.setProperties,
        computed: Ember.computed,
        defineProperty: Ember.defineProperty,
        observer: Ember.observer,
      },
      "@ember/object/computed": {
        alias: Ember.computed.alias,
        and: Ember.computed.and,
        bool: Ember.computed.bool,
        collect: Ember.computed.collect,
        deprecatingAlias: Ember.computed.deprecatingAlias,
        empty: Ember.computed.empty,
        equal: Ember.computed.equal,
        filter: Ember.computed.filter,
        filterBy: Ember.computed.filterBy,
        gt: Ember.computed.gt,
        gte: Ember.computed.gte,
        intersect: Ember.computed.intersect,
        lt: Ember.computed.lt,
        lte: Ember.computed.lte,
        map: Ember.computed.map,
        mapBy: Ember.computed.mapBy,
        match: Ember.computed.match,
        max: Ember.computed.max,
        min: Ember.computed.min,
        none: Ember.computed.none,
        not: Ember.computed.not,
        notEmpty: Ember.computed.notEmpty,
        oneWay: Ember.computed.oneWay,
        or: Ember.computed.or,
        readOnly: Ember.computed.readOnly,
        reads: Ember.computed.reads,
        setDiff: Ember.computed.setDiff,
        sort: Ember.computed.sort,
        sum: Ember.computed.sum,
        union: Ember.computed.union,
        uniq: Ember.computed.uniq,
        uniqBy: Ember.computed.uniqBy,
      },
      "@ember/object/mixin": { default: Ember.Mixin },
      "@ember/object/proxy": { default: Ember.ObjectProxy },
      "@ember/object/promise-proxy-mixin": { default: Ember.PromiseProxyMixin },
      "@ember/object/evented": {
        default: Ember.Evented,
        on: Ember.on,
      },
      "@ember/routing/route": { default: Ember.Route },
      "@ember/routing/router": { default: Ember.Router },
      "@ember/runloop": {
        bind: Ember.run.bind,
        cancel: Ember.run.cancel,
        debounce: Ember.testing ? Ember.run : Ember.run.debounce,
        later: Ember.run.later,
        next: Ember.run.next,
        once: Ember.run.once,
        run: Ember.run,
        schedule: Ember.run.schedule,
        scheduleOnce: Ember.run.scheduleOnce,
        throttle: Ember.run.throttle,
      },
      "@ember/service": {
        default: Ember.Service,
        inject: Ember.inject.service,
      },
      "@ember/utils": {
        isBlank: Ember.isBlank,
        isEmpty: Ember.isEmpty,
        isNone: Ember.isNone,
        isPresent: Ember.isPresent,
      },
      rsvp: {
        asap: Ember.RSVP.asap,
        all: Ember.RSVP.all,
        allSettled: Ember.RSVP.allSettled,
        race: Ember.RSVP.race,
        hash: Ember.RSVP.hash,
        hashSettled: Ember.RSVP.hashSettled,
        rethrow: Ember.RSVP.rethrow,
        defer: Ember.RSVP.defer,
        denodeify: Ember.RSVP.denodeify,
        resolve: Ember.RSVP.resolve,
        reject: Ember.RSVP.reject,
        map: Ember.RSVP.map,
        filter: Ember.RSVP.filter,
        default: Ember.RSVP,
        Promise: Ember.RSVP.Promise,
        EventTarget: Ember.RSVP.EventTarget,
      },
      "@ember/string": {
        w: Ember.String.w,
        dasherize: Ember.String.dasherize,
        decamelize: Ember.String.decamelize,
        camelize: Ember.String.camelize,
        classify: Ember.String.classify,
        underscore: Ember.String.underscore,
        capitalize: Ember.String.capitalize,
      },
      "@ember/template": {
        htmlSafe: Ember.String.htmlSafe,
      },
      "@ember/application": {
        default: Ember.Application,
        setOwner: Ember.setOwner,
        getOwner: Ember.getOwner,
      },
      "@ember/component/helper": {
        default: Ember.Helper,
      },
      "@ember/component/text-field": {
        default: Ember.TextField,
      },
      "@ember/component/text-area": {
        default: Ember.TextArea,
      },
      "@ember/error": {
        default: Ember.error,
      },
      "@ember/object/internals": {
        guidFor: Ember.guidFor,
      },
      "@ember/test": {
        registerWaiter: Ember.Test && Ember.Test.registerWaiter,
        unregisterWaiter: Ember.Test && Ember.Test.unregisterWaiter,
      },
      I18n: {
        // eslint-disable-next-line
        default: I18n,
      },
    };
  }

  var _isArray;
  if (!Array.isArray) {
    _isArray = function (x) {
      return Object.prototype.toString.call(x) === "[object Array]";
    };
  } else {
    _isArray = Array.isArray;
  }

  var registry = {};
  var seen = {};
  var FAILED = false;

  var uuid = 0;

  function tryFinally(tryable, finalizer) {
    try {
      return tryable();
    } finally {
      finalizer();
    }
  }

  function unsupportedModule(length) {
    throw new Error(
      "an unsupported module was defined, expected `define(name, deps, module)` instead got: `" +
        length +
        "` arguments to define`"
    );
  }

  function deprecatedModule(depricated, useInstead) {
    var warning = "[DEPRECATION] `" + depricated + "` is deprecated.";
    if (useInstead) {
      warning += " Please use `" + useInstead + "` instead.";
    }
    // eslint-disable-next-line no-console
    console.warn(warning);
  }

  var defaultDeps = ["require", "exports", "module"];

  function Module(name, deps, callback, exports) {
    this.id = uuid++;
    this.name = name;
    this.deps = !deps.length && callback.length ? defaultDeps : deps;
    this.exports = exports || {};
    this.callback = callback;
    this.state = undefined;
    this._require = undefined;
  }

  Module.prototype.makeRequire = function () {
    var name = transformForAliases(this.name);

    return (
      this._require ||
      (this._require = function (dep) {
        return requirejs(resolve(dep, name));
      })
    );
  };

  define = function (name, deps, callback) {
    if (arguments.length < 2) {
      unsupportedModule(arguments.length);
    }

    if (!_isArray(deps)) {
      callback = deps;
      deps = [];
    }

    registry[name] = new Module(name, deps, callback);
  };

  // we don't support all of AMD
  // define.amd = {};
  // we will support petals...
  define.petal = {};

  function Alias(path) {
    this.name = path;
  }

  define.alias = function (path) {
    return new Alias(path);
  };

  function reify(mod, name, rseen) {
    var deps = mod.deps;
    var length = deps.length;
    var reified = new Array(length);
    var dep;
    // TODO: new Module
    // TODO: seen refactor
    var module = {};

    for (var i = 0, l = length; i < l; i++) {
      dep = deps[i];
      if (dep === "exports") {
        module.exports = reified[i] = rseen;
      } else if (dep === "require") {
        reified[i] = mod.makeRequire();
      } else if (dep === "module") {
        mod.exports = rseen;
        module = reified[i] = mod;
      } else {
        reified[i] = requireFrom(resolve(dep, name), name);
      }
    }

    return {
      deps: reified,
      module: module,
    };
  }

  function requireFrom(name, origin) {
    name = transformForAliases(name);

    if (name === "discourse") {
      // eslint-disable-next-line no-console
      console.log(
        "discourse has been moved to `discourse/app` - please update your code"
      );
      name = "discourse/app";
    }

    if (name === "discourse/models/input-validation") {
      // eslint-disable-next-line no-console
      console.log(
        "input-validation has been removed and should be replaced with `@ember/object`"
      );
      name = "@ember/object";
    }

    var mod = JS_MODULES[name] || registry[name];
    if (!mod) {
      throw new Error(
        "Could not find module `" + name + "` imported from `" + origin + "`"
      );
    }
    return requirejs(name);
  }

  function missingModule(name) {
    throw new Error("Could not find module " + name);
  }

  function transformForAliases(name) {
    var alias = ALIASES[name];
    if (!alias) {
      var segment = name.split("/")[0];
      var prepend = ALIAS_PREPEND[segment];
      if (!prepend) {
        return name;
      }
      alias = prepend + name;
    }
    deprecatedModule(name, alias);
    return alias;
  }

  requirejs = require = function (name) {
    name = transformForAliases(name);
    if (JS_MODULES[name]) {
      return JS_MODULES[name];
    }

    var mod = registry[name];

    if (mod && mod.callback instanceof Alias) {
      mod = registry[mod.callback.name];
    }

    if (!mod) {
      missingModule(name);
    }

    if (mod.state !== FAILED && seen.hasOwnProperty(name)) {
      return seen[name];
    }

    var reified;
    var module;
    var loaded = false;

    seen[name] = {}; // placeholder for run-time cycles

    tryFinally(
      function () {
        reified = reify(mod, name, seen[name]);
        module = mod.callback.apply(this, reified.deps);
        loaded = true;
      },
      function () {
        if (!loaded) {
          mod.state = FAILED;
        }
      }
    );

    var obj;
    if (module === undefined && reified.module.exports) {
      obj = reified.module.exports;
    } else {
      obj = seen[name] = module;
    }

    if (
      obj !== null &&
      (typeof obj === "object" || typeof obj === "function") &&
      obj["default"] === undefined
    ) {
      obj["default"] = obj;
    }

    return (seen[name] = obj);
  };
  window.requireModule = requirejs;

  function resolve(child, name) {
    if (child.charAt(0) !== ".") {
      return child;
    }

    var parts = child.split("/");
    var nameParts = name.split("/");
    var parentBase = nameParts.slice(0, -1);

    for (var i = 0, l = parts.length; i < l; i++) {
      var part = parts[i];

      if (part === "..") {
        if (parentBase.length === 0) {
          throw new Error("Cannot access parent module of root");
        }
        parentBase.pop();
      } else if (part === ".") {
        continue;
      } else {
        parentBase.push(part);
      }
    }

    return parentBase.join("/");
  }

  requirejs.entries = requirejs._eak_seen = registry;
  requirejs.clear = function () {
    requirejs.entries = requirejs._eak_seen = registry = {};
    seen = {};
  };
})();
