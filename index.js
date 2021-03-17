'use strict'

const fp = require('fastify-plugin')
const { assign } = Object

async function fastifyApi (fastify, options) {
  const get = (...args) => registerMethod('get', ...args)
  const post = (...args) => registerMethod('post', ...args)
  const put = (...args) => registerMethod('put', ...args)
  const del = (...args) => registerMethod('delete', ...args)
  const api = function (setter) {
    const structure = setter({ get, post, put, del })
    const binder = func => func.bind(fastify)
    assign(api.client, recursiveRegister(structure, binder))
  }

  api.client = {}
  api.get = get
  api.post = post
  api.put = put
  api.del = del

  function registerMethod (method, url, options, handler) {
    // eslint-disable-next-line prefer-const
    let wrapper
    if (!handler) {
      handler = options
      fastify[method](url, function (req, reply) {
        return handler.call(this, req.params, req, reply)
      })
    } else {
      fastify[method](url, options, function (req, reply) {
        return handler.call(this, req.params, req, reply)
      })
    }
    // eslint-disable-next-line prefer-const
    wrapper = async function (params, reqOptions = {}) {
      const reqURL = applyParams(url, params)
      if (!reqURL) {
        throw new Error('Provided params don\'t match this API method\'s URL format')
      }
      const virtualReq = {
        method: reqOptions.method || 'GET',
        query: reqOptions.query,
        headers: reqOptions.headders,
        payload: reqOptions.body,
        url: reqURL
      }
      const res = await fastify.inject(virtualReq)
      return {
        status: res.statusCode,
        headers: res.headers,
        body: JSON.parse(res.payload)
      }
    }
    return new APIFunction(handler.name, wrapper)
  }

  fastify.decorate(options.decorateAs || 'api', api)
}

module.exports = fp(fastifyApi)

function APIFunction (name, func) {
  this.name = name
  this.func = func
}

function applyParams (template, params) {
  try {
    return template.replace(/:(\w+)/, (_, m) => {
      if (params[m]) {
        return params[m]
      } else {
        // eslint-disable-next-line no-throw-literal
        throw null
      }
    })
  } catch (err) {
    return null
  }
}

function recursiveRegister (obj, binder, result = {}) {
  if (Array.isArray(obj)) {
    for (const namedFunc of obj) {
      result[namedFunc.name] = binder(namedFunc.func)
    }
  } else {
    for (const p in obj) {
      if (obj[p] instanceof APIFunction) {
        result[obj[p].name || p] = obj[p].func
      } else if (obj[p] && (Array.isArray(obj[p]) || typeof obj[p] === 'object')) {
        result[p] = recursiveRegister(obj[p], binder)
      }
    }
  }
  return result
}
