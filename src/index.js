import refactor from 'json-refactor';
import request from 'reqwest';
import { getOption } from './util';
import { error, info } from './logger';

let env = 0;

const setEnv = e => {
  env = e;
};

const getEnv = () => env;

const sets = {
  // error field when response's status code is `3XX, 4XX, 5XX`
  errorField: 'error',
  // whether current mode is debug
  debug: !0,
  // disable request cache for `GET, HEAD` methods
  disableCache: !0,
  // field name for appending timestamp to original url when `disableCache` is `true`
  disableCacheField: '_',
};

const setSettings = params => {
  Object.keys(params).forEach(key => {
    sets[key] = params[key];
  });
};

// const getSetting = name => sets[name];

const configs = {};

const addConfig = (name, options) => {
  // One
  if (options) {
    configs[name] = options;
  }
  // Multiple
  else {
    Object.keys(name).forEach(key => {
      configs[key] = name[key];
    });
  }
};

const postHandle = (name, params) => res => {
  // current config
  const nConfig = configs[name];
  // common config
  const cConfig = configs.common || {};

  const {
    refactor: nRefactor,
    responseRefactor: nResponseRefactor,
    post: nPost,
    postHandle: nPostHandle,
  } = nConfig;
  const {
    refactor: cRefactor,
    responseRefactor: cResponseRefactor,
    post: cPost,
    postHandle: cPostHandle,
  } = cConfig;

  const rules = getOption(env, nRefactor, nResponseRefactor);
  const commonRules = getOption(env, cRefactor, cResponseRefactor);
  const post = getOption(env, nPost, nPostHandle);
  const commonPost = getOption(env, cPost, cPostHandle);

  let response = res;

  if (commonRules) refactor(response, commonRules);
  if (rules) refactor(response, rules);
  if (commonPost) {
    const result = commonPost(response, params, name);

    // if return a new object, use it
    if (result) response = result;
  }
  if (post) {
    const result = post(response, params, name);

    // if return a new object, use it
    if (result) response = result;
  }

  return response;
};

const send = (name, params = {}, callback) => {
  if (!name) return;

  // current config
  const nConfig = configs[name];
  // common config
  const cConfig = configs.common || {};

  if (!nConfig) {
    error(`name ${name} is not configured`);
    return;
  }

  const {
    method: nMethod,
    stringify: nStringify,
    settings: nSettings,
    url: nUrl,
    req: nReq,
    requestKeys: nRequestKeys,
    pre: nPre,
    preHandle: nPreHandle,
    implement: nImplement,
  } = nConfig;

  const { pre: cPre, preHandle: cPreHandle } = cConfig;

  const method = (getOption(env, nMethod) || 'get').toUpperCase();
  const stringify = getOption(env, nStringify) || !1;
  const settings = getOption(env, nSettings) || {};
  const url = getOption(env, nUrl) || '';
  const req = getOption(env, nReq, nRequestKeys) || {};
  const pre = getOption(env, nPre, nPreHandle);
  const commonPre = getOption(env, cPre, cPreHandle);
  const implement = getOption(env, nImplement);

  let realParams = { ...params };

  Object.keys(realParams).forEach(key => {
    const newKey = req[key];
    if (newKey && typeof newKey === 'string' && newKey !== key) {
      // make a new key
      realParams[newKey] = realParams[key];
      // delete old key
      delete realParams[key];
    }
  });

  if (commonPre) {
    const result = commonPre(realParams, name);

    // if return a new object, use it
    if (result) realParams = result;
  }
  if (pre) {
    const result = pre(realParams, name);

    // if return a new object, use it
    if (result) realParams = result;
  }

  if (implement) {
    implement(result => {
      if (sets.debug) {
        info(`custom ajax implement for name[${name}]:`);
        info(`request params is`, realParams);
        info(`result is`, result);
      }

      if (callback) callback(postHandle(name, realParams)(result));
    }, realParams);

    return;
  }

  settings.url = url;
  settings.method = method;
  settings.type = 'json';

  if (method !== 'GET' && method !== 'HEAD') {
    settings.data = stringify ? JSON.stringify(realParams) : realParams;

    if (!settings.headers) settings.headers = {};

    if (!settings.headers['Content-Type'])
      settings.headers['Content-Type'] = stringify
        ? 'application/json'
        : 'application/x-www-form-urlencoded;charset=UTF-8';
  } else {
    const usedParams = { ...realParams };

    if (sets.disableCache)
      usedParams[sets.disableCacheField] = new Date().getTime();

    settings.data = usedParams;
  }

  settings.success = result => {
    if (callback) callback(postHandle(name, realParams)(result));
  };
  settings.error = err => {
    const result = { [sets.errorField]: !0, response: err };
    if (callback) callback(postHandle(name, realParams)(result));
  };

  request(settings);
};

send.config = addConfig;
send.setEnv = setEnv;
send.getEnv = getEnv;
send.set = setSettings;

export default send;
