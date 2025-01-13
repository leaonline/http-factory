import { WebApp } from 'meteor/webapp'
import { check, Match } from 'meteor/check'
import { EJSON } from 'meteor/ejson'

const isPreflight = req => req.method.toLowerCase() === 'options'
const httpMethods = ['get', 'head', 'post', 'put', 'delete', 'options', 'trace', 'patch']
const isMaybeHttpMethod = Match.Where(x => !x || httpMethods.includes(x))

function handleError (res, { error, title, description, code, info }) {
  res.status(code || 500)
  res.set({ 'Content-Type': 'application/json' })
  res.json({
    title: title,
    description: description,
    info: info || (error && error.message)
  })
}

function registerHandler ({ app, path, method, handler }) {
  // ensure the method exists
  if (method && !Object.prototype.hasOwnProperty.call(app, method)) {
    throw new TypeError(`Undefined method "${method}"`)
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
    case 'delete':
      return app.delete(...args)
    default:
      return app.use(...args)
  }
}

/**
 * Creates a new factory for HTTP routes with global settings
 * @param schemaFactory {function?} optional function to validate arguments by schema
 * @param onError {function?} optional global error handler for any route errors
 * @param isRaw {boolean?} optional, attach on raw connect handlers if true
 * @param globalMiddleware {any} optional global mixins of custom middleware functions
 * @return {function({path?: *, schema?: *, method?: *, run?: *, validate?: *, onError?: *, middleware?: *}): handler}
 *  a factory-method to create all routes by given configs
 */
export const createHTTPFactory = ({ schemaFactory, onError, isRaw, ...globalMiddleware } = {}) => {
  check(schemaFactory, Match.Maybe(Function))
  check(onError, Match.Maybe(Function))
  check(isRaw, Match.Maybe(Boolean))

  const isRequiredSchema = schemaFactory ? Object : Match.Maybe(Object)
  const app = isRaw ? WebApp.rawHandlers : WebApp.handlers
  const globalErrorHook = onError || (() => {})

  Object.values(globalMiddleware).forEach(gmw => {
    check(gmw, Function)
    registerHandler({ app, handler: gmw })
  })

  /**
   *
   * @param path
   * @param schema
   * @param method
   * @param run
   * @param validate
   * @param onError
   * @param middleware
   * @return {handler}
   */
  const routeHandler = ({ path, schema = {}, method = '', run, validate, onError, ...middleware }) => {
    check(path, Match.Maybe(String))
    check(schema, isRequiredSchema)
    check(method, isMaybeHttpMethod)
    check(validate, Match.Maybe(Function))
    check(onError, Match.Maybe(Function))
    check(run, Function)

    const localErrorHook = onError || globalErrorHook
    const errorHook = async e => localErrorHook(e, method, path)

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

    const handler = async function (req, res, next) {
      // end the request here, if it's a preflight
      if (isPreflight(req)) {
        res.status(200)
        return res.end()
      }

      // then we validate the query / body or end
      let requestParams
      try {
        requestParams = {
          ...req.params,
          ...req.body,
          ...req.query
        }
        console.debug({ requestParams })
        console.debug(schema)
        validateFn(requestParams || {})
      } catch (validationError) {
        await errorHook(validationError)

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
        /**
         * resume the route with error code, logging is off by default
         * @param error
         * @param code
         * @param title
         * @param description
         * @param info
         * @param logError
         */
        error: async ({ error, code, title, description, info }) => {
          await errorHook(error)
          handleError(res, { error, code, title, description, info })
        },

        /**
         * Return the current route data from query or body or add it to
         * them for the next middleware
         * @return {object} the current params of the request
         */
        data: () => requestParams,
        /**
         * Logs args to to the console
         * @param logArgs
         */
        log: (...logArgs) => {
          logArgs.unshift(pathName) && console.log.apply(console, logArgs)
        }
      }

      try {
        result = await run.call(environment, req, res, nextWrapper)
      } catch (invocationError) {
        await errorHook(invocationError)

        return handleError(res, {
          error: invocationError,
          code: 500,
          title: 'Internal Server Error',
          description: 'An unintended error occurred.'
        })
      }

      // at this point we may skip, because the user has already written the request
      // inside the run method on their own behalf
      if (nextCalled || res.headersSent) return

      // if the function has no return value,
      // we assume to pass on to the next handler
      // this can be skipped if the result would be
      // explicit, such as null, [], {}, etc.
      if (typeof result === 'undefined') return next()

      res.status(200)
      res.set({ 'Content-Type': 'application/json' })

      const body = EJSON.stringify(result)
      return res.send(body)
    }

    registerHandler({ app, method, path, handler })
    return handler
  }

  // finally return route handler
  return routeHandler
}
