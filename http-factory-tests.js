/* global describe it beforeEach */
import { Meteor } from 'meteor/meteor'
import { check } from 'meteor/check'
import { WebApp } from 'meteor/webapp'
import { Mongo } from 'meteor/mongo'
import { Random } from 'meteor/random'
import { HTTP } from 'meteor/http'
import { HTTP as HTTP2 } from 'meteor/jkuester:http'
import { createHTTPFactory } from 'meteor/leaonline:http-factory'
import { expect } from 'chai'
import bodyParser from 'body-parser'
import SimpleSchema from 'simpl-schema'

const schemaFactory = def => new SimpleSchema(def)
const createRandomPath = () => `/${Random.id()}`
const toUrl = path => Meteor.absoluteUrl(path)
const LocalCollection = new Mongo.Collection(null)

WebApp.connectHandlers.urlEncoded(bodyParser)

describe('defaults, no params', function () {
  let randomPath
  let testId

  beforeEach(function () {
    randomPath = createRandomPath()
    testId = Random.id()
  })

  it('creates a http route with minimal params', function (done) {
    const createHttpRoute = createHTTPFactory()

    createHttpRoute({
      path: randomPath,
      run: function () {
        return { testId }
      }
    })

    HTTP.get(toUrl(randomPath), (err, res) => {
      expect(err).to.equal(null)
      expect(res.statusCode).to.equal(200)
      expect(res.content).to.equal(JSON.stringify({ testId }))
      done()
    })
  })

  it('allows to manipulate response manually', function (done) {
    const createHttpRoute = createHTTPFactory()

    createHttpRoute({
      path: randomPath,
      run: function (req, res) {
        const requestParams = this.data()
        expect(requestParams).to.deep.equal(req.query)
        res.writeHead(200)
        res.end(testId)
      }
    })

    HTTP.get(toUrl(randomPath), {}, (err, res) => {
      expect(err).to.equal(null)
      expect(res.statusCode).to.equal(200)
      expect(res.content).to.equal(testId)
      done()
    })
  })

  it('allows to manipulate request data for next handler', function (done) {
    const createHttpRoute = createHTTPFactory()

    createHttpRoute({
      path: randomPath,
      run: function (req, res, next) {
        this.data({ testId })
        next()
      }
    })

    createHttpRoute({
      path: randomPath,
      run: function (req, res, next) {
        const { testId } = this.data()
        return testId
      }
    })

    HTTP.get(toUrl(randomPath), {}, (err, res) => {
      expect(err).to.equal(null)
      expect(res.statusCode).to.equal(200)
      expect(res.content).to.equal(testId)
      done()
    })
  })

  it('allows to manipulate request and pass to the next handler', function (done) {
    const createHttpRoute = createHTTPFactory()

    createHttpRoute({
      path: randomPath,
      run: function (req, res, next) {
        req.foo = testId
        next()
      }
    })

    createHttpRoute({
      path: randomPath,
      run: function (req, res, next) {
        expect(req.foo).to.equal(testId)
        return testId
      }
    })

    HTTP.get(toUrl(randomPath), {}, (err, res) => {
      expect(err).to.equal(null)
      expect(res.statusCode).to.equal(200)
      expect(res.content).to.equal(testId)
      done()
    })
  })

  it('creates an error response if the request fails', function (done) {
    const createHttpRoute = createHTTPFactory()

    createHttpRoute({
      path: randomPath,
      run: function () {
        throw new Error(testId)
      }
    })

    HTTP.get(toUrl(randomPath), (err) => {
      const error = err.response
      expect(error.statusCode).to.equal(500)
      expect(error.data.title).to.equal('Internal Server Error')
      expect(error.data.description).to.equal('An unintended error occurred.')
      expect(error.data.info).to.equal(testId)
      done()
    })
  })

  it('can run in combination with a Mongo.Collection', function (done) {
    const createHttpRoute = createHTTPFactory()
    const insertId = LocalCollection.insert({ testId })

    createHttpRoute({
      path: randomPath,
      run: function () {
        return LocalCollection.findOne(insertId).testId
      }
    })

    HTTP.get(toUrl(randomPath), (err, res) => {
      expect(err).to.equal(null)
      expect(res.statusCode).to.equal(200)
      done()
    })
  })

  ;['get', 'head', 'post', 'put', 'delete', 'options', 'trace', 'patch'].forEach(method => {
    it(`creates a http ${method} route with minimal params`, function (done) {
      const createHttpRoute = createHTTPFactory()
      createHttpRoute({
        path: randomPath,
        method: method,
        run: function () { return null }
      })

      const url = toUrl(randomPath)

      HTTP.call(method, url, (err, res) => {
        try {
          expect(err).to.equal(null)
          expect(res.statusCode).to.equal(200)
        } catch (assertionError) {
          return done(assertionError)
        }
        done()
      })
    })
  })
})

describe('with schema', function () {
  let randomPath
  let testId

  const checkMatchFactory = (schema) => ({
    validate (args) {
      check(args, schema)
    }
  })

  beforeEach(function () {
    randomPath = createRandomPath()
    testId = Random.id()
  })

  it('does not validate if no schema is defined', function (done) {
    const createHttpRoute = createHTTPFactory({ schemaFactory })
    createHttpRoute({
      path: randomPath,
      run: function () {
        return { testId }
      }
    })

    HTTP.get(toUrl(randomPath), (err, res) => {
      expect(err).to.equal(null)
      expect(res.statusCode).to.equal(200)
      expect(res.content).to.equal(JSON.stringify({ testId }))
      done()
    })
  })
  it('allows to validate query using SimpleSchema', function (done) {
    const otherId = Random.id()
    const createHttpRoute = createHTTPFactory({ schemaFactory })
    createHttpRoute({
      path: randomPath,
      method: 'get',
      schema: { otherId: String },
      run: function () {
        const { otherId } = this.data()
        return { testId, otherId }
      }
    })

    HTTP.get(toUrl(randomPath), { params: {} }, (err) => {
      const error = err.response
      expect(error.statusCode).to.equal(400)
      expect(error.data.title).to.equal('Bad Request')
      expect(error.data.description).to.equal('Malformed query or body.')
      expect(error.data.info).to.equal('Other ID is required')

      HTTP.get(toUrl(randomPath), { params: { otherId } }, (err, res) => {
        expect(err).to.equal(null)
        expect(res.statusCode).to.equal(200)
        expect(res.content).to.equal(JSON.stringify({ testId, otherId }))
        done()
      })
    })
  })
  it('allows to validate body using SimpleSchema', function (done) {
    const createHttpRoute = createHTTPFactory({ schemaFactory })
    createHttpRoute({
      path: randomPath,
      method: 'post',
      schema: { otherId: String },
      run: function () {
        const { otherId } = this.data()
        return { testId, otherId }
      }
    })

    HTTP.post(toUrl(randomPath), { params: {} }, (err) => {
      const error = err.response
      expect(error.statusCode).to.equal(400)
      expect(error.data.title).to.equal('Bad Request')
      expect(error.data.description).to.equal('Malformed query or body.')
      expect(error.data.info).to.equal('Other ID is required')

      const otherId = Random.id()
      HTTP.post(toUrl(randomPath), { params: { otherId } }, (err, res) => {
        expect(err).to.equal(null)
        expect(res.statusCode).to.equal(200)
        expect(res.content).to.equal(JSON.stringify({ testId, otherId }))
        done()
      })
    })
  })
  it('allows to validate query using check/Match', function (done) {
    const createHttpRoute = createHTTPFactory({ schemaFactory: checkMatchFactory })
    const otherId = Random.id()

    createHttpRoute({
      path: randomPath,
      method: 'get',
      schema: { otherId: String },
      run: function () {
        const { otherId } = this.data()
        return { testId, otherId }
      }
    })

    HTTP.get(toUrl(randomPath), { params: {} }, (err) => {
      const error = err.response
      expect(error.statusCode).to.equal(400)
      expect(error.data.title).to.equal('Bad Request')
      expect(error.data.description).to.equal('Malformed query or body.')
      expect(error.data.info).to.equal('Match error: Missing key \'otherId\'')

      HTTP.get(toUrl(randomPath), { params: { otherId } }, (err, res) => {
        expect(err).to.equal(null)
        expect(res.statusCode).to.equal(200)
        expect(res.content).to.equal(JSON.stringify({ testId, otherId }))
        done()
      })
    })
  })
  it('allows to validate body using check/Match', function (done) {
    const createHttpRoute = createHTTPFactory({ schemaFactory: checkMatchFactory })
    createHttpRoute({
      path: randomPath,
      method: 'post',
      schema: { otherId: String },
      run: function () {
        const { otherId } = this.data()
        return { testId, otherId }
      }
    })

    HTTP.post(toUrl(randomPath), { params: {} }, (err) => {
      const error = err.response
      expect(error.statusCode).to.equal(400)
      expect(error.data.title).to.equal('Bad Request')
      expect(error.data.description).to.equal('Malformed query or body.')
      expect(error.data.info).to.equal('Match error: Missing key \'otherId\'')

      const otherId = Random.id()
      HTTP.post(toUrl(randomPath), { params: { otherId } }, (err, res) => {
        expect(err).to.equal(null)
        expect(res.statusCode).to.equal(200)
        expect(res.content).to.equal(JSON.stringify({ testId, otherId }))
        done()
      })
    })
  })
  it('allows to override validation using validate', function (done) {
    const createHttpRoute = createHTTPFactory({ schemaFactory: checkMatchFactory })
    createHttpRoute({
      path: randomPath,
      method: 'post',
      schema: { otherId: String },
      validate: () => {},
      run: function () {
        const { otherId } = this.data()
        return { testId, otherId }
      }
    })

    HTTP.post(toUrl(randomPath), { params: {} }, (err, res) => {
      expect(err).to.equal(null)
      expect(res.statusCode).to.equal(200)
      expect(res.content).to.equal(JSON.stringify({
        testId,
        otherId: undefined
      }))
      done()
    })
  })
})

describe('with error handler', function () {
  let randomPath
  let errorId

  beforeEach(function () {
    randomPath = createRandomPath()
    errorId = Random.id()
  })

  it('allows to pass global onError', function (done) {
    let hooked = false
    const createHttpRoute = createHTTPFactory({
      onError: e => {
        expect(e.message).to.equal(errorId)
        hooked = true
      }
    })

    createHttpRoute({
      path: randomPath,
      run: function () {
        throw new Error(errorId)
      }
    })

    HTTP.get(toUrl(randomPath), (err, res) => {
      expect(res.statusCode).to.equal(500)
      expect(err.response.data.info).to.equal(errorId)
      expect(hooked).to.equal(true)
      done()
    })
  })

  it('allows to pass local onError', function (done) {
    let hooked = false
    const createHttpRoute = createHTTPFactory()

    createHttpRoute({
      path: randomPath,
      run: function () {
        throw new Error(errorId)
      },
      onError: e => {
        expect(e.message).to.equal(errorId)
        hooked = true
      }
    })

    HTTP.get(toUrl(randomPath), (err, res) => {
      expect(res.statusCode).to.equal(500)
      expect(err.response.data.info).to.equal(errorId)
      expect(hooked).to.equal(true)
      done()
    })
  })

  it('allows to override global onError with local onError', function (done) {
    let hooked = false
    const createHttpRoute = createHTTPFactory({
      onError: () => {}
    })

    createHttpRoute({
      path: randomPath,
      run: function () {
        throw new Error(errorId)
      },
      onError: e => {
        expect(e.message).to.equal(errorId)
        hooked = true
      }
    })

    HTTP.get(toUrl(randomPath), (err, res) => {
      expect(res.statusCode).to.equal(500)
      expect(err.response.data.info).to.equal(errorId)
      expect(hooked).to.equal(true)
      done()
    })
  })
})

describe('define middleware', function () {
  let randomPath
  let testId

  beforeEach(function () {
    randomPath = createRandomPath()
    testId = Random.id()
  })

  const xAuthToken = Random.secret()
  const simpleAuthInternal = function (req, res, next) {
    if (req.headers['x-auth-token'] !== xAuthToken) {
      // internally defined middleware can make use of the environment
      // so
      return this.error({
        code: 403,
        title: 'Permission Denied'
      })
    }
    next()
  }

  const simpleAuthExternal = function (req, res, next) {
    if (req.headers['x-auth-token'] !== xAuthToken) {
      // external middleware is neither bound to the environment
      // nor affected in any way, so it can 100% maintin it's logic
      // however, this.error is not available here
      const body = JSON.stringify({ title: 'Permission Denied' })
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(body)
    }
    next()
  }

  it('allows to add middleware as external', function (done) {
    const createHttpRoute = createHTTPFactory()

    createHttpRoute({
      path: randomPath,
      method: 'post',
      simpleAuth: simpleAuthExternal,
      run: function () {
        return testId
      }
    })

    // should not be affected
    const otherRandomPath = createRandomPath()
    createHttpRoute({
      path: otherRandomPath,
      method: 'post',
      run: function () {
        return testId
      }
    })

    HTTP.post(toUrl(otherRandomPath), (err, res) => {
      expect(err).to.equal(null)
      expect(res.statusCode).to.equal(200)
      expect(res.content).to.equal(testId)
    })

    HTTP.post(toUrl(randomPath), (err, res) => {
      const error = err.response
      expect(error.statusCode).to.equal(403)
      expect(error.data.title).to.equal('Permission Denied')
      expect(res.content).to.equal(JSON.stringify({ title: 'Permission Denied' }))

      const headers = { 'x-auth-token': xAuthToken }
      HTTP.post(toUrl(randomPath), { headers }, (err, res) => {
        expect(err).to.equal(null)
        expect(res.statusCode).to.equal(200)
        expect(res.content).to.equal(testId)
        done()
      })
    })
  })

  it('allows to define middleware as internal', function (done) {
    const createHttpRoute = createHTTPFactory()

    createHttpRoute({
      path: randomPath,
      method: 'get',
      run: simpleAuthInternal,
    })

    createHttpRoute({
      path: randomPath,
      method: 'get',
      run: function () {
        return testId
      }
    })

    // should not be affected
    createHttpRoute({
      path: randomPath,
      method: 'post',
      run: function () {
        return testId
      }
    })

    HTTP.post(toUrl(randomPath), (err, res) => {
      expect(err).to.equal(null)
      expect(res.statusCode).to.equal(200)
      expect(res.content).to.equal(testId)
    })

    HTTP.get(toUrl(randomPath), (err, res) => {
      const error = err.response
      expect(error.statusCode).to.equal(403)
      expect(error.data.title).to.equal('Permission Denied')
      expect(res.content).to.equal(JSON.stringify({ title: 'Permission Denied' }))

      const headers = { 'x-auth-token': xAuthToken }
      HTTP.get(toUrl(randomPath), { headers }, (err, res) => {
        expect(err).to.equal(null)
        expect(res.statusCode).to.equal(200)
        expect(res.content).to.equal(testId)
        done()
      })
    })
  })

  it('allows to add middleware on a global level', function (done) {
    const createHttpRoute = createHTTPFactory({
      simpleAuth: simpleAuthExternal
    })

    createHttpRoute({
      path: randomPath,
      method: 'put',
      run: function () {
        return testId
      }
    })

    HTTP.call('put', toUrl(randomPath), (err, res) => {
      const error = err.response
      expect(error.statusCode).to.equal(403)
      expect(error.data.title).to.equal('Permission Denied')
      expect(res.content).to.equal(JSON.stringify({ title: 'Permission Denied' }))

      const headers = { 'x-auth-token': xAuthToken }
      HTTP.call('put', toUrl(randomPath), { headers }, (err, res) => {
        expect(err).to.equal(null)
        expect(res.statusCode).to.equal(200)
        expect(res.content).to.equal(testId)
        done()
      })
    })
  })
})
