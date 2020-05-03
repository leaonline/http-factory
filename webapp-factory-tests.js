/* global describe it beforeEach */
import { Meteor } from 'meteor/meteor'
import { check } from 'meteor/check'
import { WebApp } from 'meteor/webapp'
import { Mongo } from 'meteor/mongo'
import { Random } from 'meteor/random'
import { HTTP } from 'meteor/http'
import { createHTTPFactory } from 'meteor/leaonline:webapp-factory'
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
      run: function (requestParams, req, res) {
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

  it('allows to manipulate request and pass to the next handler', function (done) {
    const createHttpRoute = createHTTPFactory()

    createHttpRoute({
      path: randomPath,
      run: function (requestParams, req, res, next) {
        req.foo = testId
        next()
      }
    })

    createHttpRoute({
      path: randomPath,
      run: function (requestParams, req, res, next) {
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
        run: function () {}
      })

      HTTP.call(method, toUrl(randomPath), (err, res) => {
        expect(err).to.equal(null)
        expect(res.statusCode).to.equal(200)
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
      run: function ({ otherId }) {
        return { testId, otherId }
      }
    })

    HTTP.get(toUrl(randomPath), { params: {} }, (err) => {
      const error = err.response
      expect(error.statusCode).to.equal(400)
      expect(error.data.title).to.equal('Bad Request')
      expect(error.data.description).to.equal('Malformed query or body.')
      expect(error.data.info).to.equal('Other ID is required')
    })

    HTTP.get(toUrl(randomPath), { params: { otherId } }, (err, res) => {
      expect(err).to.equal(null)
      expect(res.statusCode).to.equal(200)
      expect(res.content).to.equal(JSON.stringify({ testId, otherId }))
      done()
    })
  })
  it('allows to validate body using SimpleSchema', function (done) {
    const createHttpRoute = createHTTPFactory({ schemaFactory })
    createHttpRoute({
      path: randomPath,
      method: 'post',
      schema: { otherId: String },
      run: function ({ otherId }) {
        return { testId, otherId }
      }
    })

    HTTP.post(toUrl(randomPath), { params: {} }, (err) => {
      const error = err.response
      expect(error.statusCode).to.equal(400)
      expect(error.data.title).to.equal('Bad Request')
      expect(error.data.description).to.equal('Malformed query or body.')
      expect(error.data.info).to.equal('Other ID is required')
    })

    const otherId = Random.id()
    HTTP.post(toUrl(randomPath), { params: { otherId } }, (err, res) => {
      expect(err).to.equal(null)
      expect(res.statusCode).to.equal(200)
      expect(res.content).to.equal(JSON.stringify({ testId, otherId }))
      done()
    })
  })
  it('allows to validate query using check/Match', function (done) {
    const createHttpRoute = createHTTPFactory({ schemaFactory: checkMatchFactory })
    const otherId = Random.id()

    createHttpRoute({
      path: randomPath,
      method: 'get',
      schema: { otherId: String },
      run: function ({ otherId }) {
        return { testId, otherId }
      }
    })

    HTTP.get(toUrl(randomPath), { params: {} }, (err) => {
      const error = err.response
      expect(error.statusCode).to.equal(400)
      expect(error.data.title).to.equal('Bad Request')
      expect(error.data.description).to.equal('Malformed query or body.')
      expect(error.data.info).to.equal('Match error: Missing key \'otherId\'')
    })

    HTTP.get(toUrl(randomPath), { params: { otherId } }, (err, res) => {
      expect(err).to.equal(null)
      expect(res.statusCode).to.equal(200)
      expect(res.content).to.equal(JSON.stringify({ testId, otherId }))
      done()
    })
  })
  it('allows to validate body using check/Match', function (done) {
    const createHttpRoute = createHTTPFactory({ schemaFactory: checkMatchFactory })
    createHttpRoute({
      path: randomPath,
      method: 'post',
      schema: { otherId: String },
      run: function ({ otherId }) {
        return { testId, otherId }
      }
    })

    HTTP.post(toUrl(randomPath), { params: {} }, (err) => {
      const error = err.response
      expect(error.statusCode).to.equal(400)
      expect(error.data.title).to.equal('Bad Request')
      expect(error.data.description).to.equal('Malformed query or body.')
      expect(error.data.info).to.equal('Match error: Missing key \'otherId\'')
    })

    const otherId = Random.id()
    HTTP.post(toUrl(randomPath), { params: { otherId } }, (err, res) => {
      expect(err).to.equal(null)
      expect(res.statusCode).to.equal(200)
      expect(res.content).to.equal(JSON.stringify({ testId, otherId }))
      done()
    })
  })
  it('allows to override validation using validate', function (done) {
    const createHttpRoute = createHTTPFactory({ schemaFactory: checkMatchFactory })
    createHttpRoute({
      path: randomPath,
      method: 'post',
      schema: { otherId: String },
      validate: () => {},
      run: function ({ otherId }) {
        return { testId, otherId }
      }
    })

    HTTP.post(toUrl(randomPath), { params: {} }, (err, res) => {
      expect(err).to.equal(null)
      expect(res.statusCode).to.equal(200)
      expect(res.content).to.equal(JSON.stringify({ testId, otherId: undefined }))
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
  const simpleAuth = function (req, res, next) {
    if (req.headers['x-auth-token'] !== xAuthToken) {
      return this.handleError(res, {
        code: 403,
        title: 'Permission Denied'
      })
    }
    next()
  }

  it('allows to add middleware on a specfic route', function (done) {
    const createHttpRoute = createHTTPFactory()

    createHttpRoute({
      path: randomPath,
      method: 'post',
      simpleAuth: simpleAuth,
      run: function () {
        return testId
      }
    })

    HTTP.post(toUrl(randomPath), (err, res) => {
      const error = err.response
      expect(error.statusCode).to.equal(403)
      expect(error.data.title).to.equal('Permission Denied')
      expect(res.content).to.equal(JSON.stringify({ title: 'Permission Denied' }))
    })

    const headers = { 'x-auth-token': xAuthToken }
    HTTP.post(toUrl(randomPath), { headers }, (err, res) => {
      expect(err).to.equal(null)
      expect(res.statusCode).to.equal(200)
      expect(res.content).to.equal(testId)
      done()
    })
  })
})
