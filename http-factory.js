import { WebApp } from 'meteor/webapp'
import { check, Match } from 'meteor/check'
import { EJSON } from 'meteor/ejson'

const isPreflight = req => req.method.toLowerCase() === 'options'
const httpMethods = ['get', 'head', 'post', 'put', 'delete', 'options', 'trace', 'patch']
const isMaybeHttpMethod = Match.Where(x => !x || httpMethods.includes(x))

function handleError (res, { error, title, description, code, info }) {
  res.writeHead(code || 500, { 'Content-Type': 'application/json' })
  const body = JSON.stringify({
    title: title,
    description: description,
    info: info || (error && error.message)
  }, null, 0)
  res.end(body)
}

function registerHandler ({ app, path, method, handler }) {
  // ensure the method exists
  if (method && !Object.prototype.hasOwnProperty.call(app, method)) {
    app.defineMethod(method)
  }

  const args = []
  if (path) args.push(path)
  args.push(handler)

  switch (method) {
    case 'get':
      return app.get(...args)
    case 'head':
      return app.head(...args)
    case 'post':
      return app.post(...args)
    case 'put':
      return app.put(...args)
    case 'options':
      return app.options(...args)
    case 'trace':
      return app.trace(...args)
    case 'patch':
      return app.patch(...args)
    default:
      return app.use(...args)
  }
}

function getRequestParams (req) {
  switch (req.method.toLowerCase()) {
    case 'post':
    case 'put':
    case 'patch':
      return Object.assign({}, req.body)
    case 'get':
      return Object.assign({}, req.query)
    default:
      return Object.assign({}, req.query, req.body)
  }
}

function addRequestParams (req, obj) {
  switch (req.method.toLowerCase()) {
    case 'post':
    case 'put':
    case 'patch':
      return Object.assign(req.body, obj)
    case 'get':
      return Object.assign(req.query, obj)
    default:
      Object.assign(req.query, obj)
      Object.assign(req.body, obj)
      return Object.assign({}, req.query, req.body)
  }
}

export const createHTTPFactory = ({ schemaFactory, isRaw, ...globalMiddleware } = {}) => {
  check(schemaFactory, Match.Maybe(Function))
  check(isRaw, Match.Maybe(Boolean))

  const isRequiredSchema = schemaFactory ? Object : Match.Maybe(Object)
  const app = isRaw ? WebApp.rawConnectHandlers : WebApp.connectHandlers

  Object.values(globalMiddleware).forEach(gmw => {
    check(gmw, Function)
    registerHandler({ app, handler: gmw })
  })

  return ({ path, schema = {}, method = '', run, validate, ...middleware }) => {
    check(path, Match.Maybe(String))
    check(schema, isRequiredSchema)
    check(method, isMaybeHttpMethod)
    check(validate, Match.Maybe(Function))
    check(run, Function)

    Object.values(middleware).forEach(mw => {
      check(mw, Function)
      registerHandler({ app, path, method, handler: mw })
    })

    // enable to run validation on the request parameters (query or body)

    let validateFn = validate || (() => {})
    if (!validate && schemaFactory) {
      const validationSchema = schemaFactory(schema)
      validateFn = function (document = {}) {
        validationSchema.validate(document)
      }
    }

    const handler = function (req, res, next) {
      // end the request here, if it's a preflight
      if (isPreflight(req)) {
        res.writeHead(200)
        return res.end()
      }

      // then we validate the query / body or end
      let requestParams
      try {
        requestParams = getRequestParams(req)
        validateFn(requestParams || {})
      } catch (validationError) {
        return handleError(res, {
          error: validationError,
          code: 400,
          title: 'Bad Request',
          description: 'Malformed query or body.'
        })
      }

      // then we run the context
      let result
      let nextCalled = false
      const nextWrapper = () => {
        nextCalled = true
        next()
      }

      const pathName = `[${method} ${path}]:`
      const environment = {
        error: ({ error, code, title, description, info }) => handleError(res, { error, code, title, description, info }),
        data: (value) => {
          if (value) {
            check(value, Object)
            requestParams = addRequestParams(req, value)
          }
          return requestParams
        },
        log: (...logArgs) => logArgs.unshift(pathName) && console.log.apply(console, logArgs)
      }

      try {
        result = run.call(environment, req, res, nextWrapper)
      } catch (invocationError) {
        return handleError(res, {
          error: invocationError,
          code: 500,
          title: 'Internal Server Error',
          description: 'An unintended error occurred.'
        })
      }

      // at this point we may skip, because the user has already written the request
      // inside the run method on their own behalf
      if (nextCalled || res._headerSent) return

      // if the function has no return value,
      // we assume to pass on to the next handler
      // this can be skipped if the result would be
      // explicit, such as null, [], {}, etc.
      if (typeof result === 'undefined') return next()

      res.writeHead(200, { 'Content-Type': 'application/json' })

      if (typeof result !== 'string') {
        return res.end(EJSON.stringify(result))
      } else {
        return res.end(result)
      }
    }

    registerHandler({ app, method, path, handler })
    return handler
  }
}
