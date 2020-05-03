import { WebApp } from 'meteor/webapp'
import { check, Match } from 'meteor/check'

const isPreflight = req => req.method.toLowerCase() === 'options'
const httpMethods = ['get', 'head', 'post', 'put', 'delete', 'options', 'trace', 'patch']
const isMaybeHttpMethod = Match.Where(x => !x || httpMethods.includes(x))

function handleError (res, { error, title, description, code }) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  const body = JSON.stringify({
    title: title,
    description: description,
    info: error && error.message
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

export const createHTTPFactory = ({ schemaFactory, isRaw, debug } = {}) => {
  check(schemaFactory, Match.Maybe(Function))
  check(isRaw, Match.Maybe(Boolean))

  const isRequiredSchema = schemaFactory ? Object : Match.Maybe(Object)
  const app = isRaw ? WebApp.rawConnectHandlers : WebApp.connectHandlers

  return ({ path, schema = {}, method = '', run, validate, ...middleware }) => {
    check(path, Match.Maybe(String))
    check(schema, isRequiredSchema)
    check(method, isMaybeHttpMethod)
    check(validate, Match.Maybe(Function))
    check(run, Function)

    Object.values(middleware).forEach(mw => {
      check(mw, Function)
      registerHandler({ app, path, method, handler: mw.bind({ handleError }) })
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
        switch (method.toLowerCase()) {
          case 'post':
            requestParams = req.body
            break
          case 'get':
            requestParams = req.query
            break
          default:
            requestParams = Object.assign({}, req.query, req.body)
            break
        }
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
      try {
        result = run.call({ handleError }, requestParams, req, res, nextWrapper)
      } catch (invocationError) {
        return handleError(res, {
          error: invocationError,
          code: 500,
          title: 'Internal Server Error',
          description: 'An unintended error occurred.'
        })
      }

      // at this point we skip, because the user has already written the request
      // inside the run method on their own behalf

      if (nextCalled || res._headerSent) return

      res.writeHead(200, { 'Content-Type': 'application/json' })

      if (typeof result !== 'string') {
        return res.end(JSON.stringify(result))
      } else {
        return res.end(result)
      }
    }

    registerHandler({ app, method, path, handler })
    return handler
  }
}
