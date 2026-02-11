/* global describe it beforeEach */
import { Meteor } from 'meteor/meteor'
import { check } from 'meteor/check'
import { WebApp } from 'meteor/webapp'
import { Mongo } from 'meteor/mongo'
import { Random } from 'meteor/random'
import { fetch } from 'meteor/fetch'
import { createHTTPFactory } from 'meteor/leaonline:http-factory'
import { expect } from 'chai'
import SimpleSchema from 'simpl-schema'

const schemaFactory = def => new SimpleSchema(def)
const createRandomPath = () => `/${Random.id()}`
const toUrl = (path, query) => {
  const base = Meteor.absoluteUrl(path)
  if (!query) {
    return base
  }
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    searchParams.append(key, value)
  }
  return `${base}?${searchParams.toString()}`
}
const LocalCollection = new Mongo.Collection(null)

WebApp.express.urlencoded({ extended: true })
WebApp.handlers.use(WebApp.express.json())

describe('defaults, no params', function () {
  let randomPath
  let testId

  beforeEach(function () {
    randomPath = createRandomPath()
    testId = Random.id()
  })

  it('creates a http route with minimal params', async () => {
    const createHttpRoute = createHTTPFactory()

    createHttpRoute({
      path: randomPath,
      run: function () {
        return testId
      }
    })

    const res = await fetch(toUrl(randomPath))
    expect(res.status).to.equal(200)
    const content = await res.json()
    expect(content).to.equal(testId)
  })

  it('allows to manipulate response manually', async () => {
    const createHttpRoute = createHTTPFactory()

    createHttpRoute({
      path: randomPath,
      run: function (req, res) {
        const requestParams = this.data()
        expect(requestParams).to.deep.equal(req.query)
        res.status(200)
        res.set('Content-Type', 'text/plain')
        res.send(testId)
      }
    })

    const res = await fetch(toUrl(randomPath))
    expect(res.status).to.equal(200)
    const content = await res.text()
    expect(content).to.equal(testId)
  })

  it('allows to manipulate request data for next handler', async () => {
    const createHttpRoute = createHTTPFactory()
    let mw1Calls = 0
    let mw2Calls = 0
    createHttpRoute({
      path: randomPath,
      run: function (req, res, next) {
        expect(req.query).to.deep.equal({})
        this.data({ testId })
        mw1Calls++
        next()
      }
    })

    createHttpRoute({
      path: randomPath,
      run: function (req, res, next) {
        const { testId } = this.data()
        mw2Calls++
        return { testId }
      }
    })

    const res = await fetch(toUrl(randomPath))
    expect(res.status).to.equal(200)
    expect(mw1Calls).to.equal(1)
    expect(mw2Calls).to.equal(1)
    const content = await res.json()
    expect(content).to.deep.equal({ testId })
  })

  it('allows to manipulate request and pass to the next handler', async () => {
    const createHttpRoute = createHTTPFactory()
    let mw1Calls = 0
    let mw2Calls = 0
    createHttpRoute({
      path: randomPath,
      run: function (req, res, next) {
        req.foo = testId
        mw1Calls++
        next()
      }
    })

    createHttpRoute({
      path: randomPath,
      run: function (req, res, next) {
        expect(req.foo).to.equal(testId)
        mw2Calls++
        return { testId }
      }
    })

    const res = await fetch(toUrl(randomPath))
    expect(res.status).to.equal(200)
    expect(mw1Calls).to.equal(1)
    expect(mw2Calls).to.equal(1)
    const content = await res.json()
    expect(content).to.deep.equal({ testId })
  })

  it('creates an error response if the request fails', async () => {
    const createHttpRoute = createHTTPFactory()

    createHttpRoute({
      path: randomPath,
      run: function () {
        throw new Error(testId)
      }
    })

    const res = await fetch(toUrl(randomPath))
    expect(res.status).to.equal(500)
    const data = await res.json()
    expect(data.title).to.equal('Internal Server Error')
    expect(data.description).to.equal('An unintended error occurred.')
    expect(data.info).to.equal(testId)
  })

  it('can run in combination with a Mongo.Collection', async () => {
    const createHttpRoute = createHTTPFactory()
    const insertId = await LocalCollection.insertAsync({ testId })

    createHttpRoute({
      path: randomPath,
      run: async () => {
        const doc = await LocalCollection.findOneAsync(insertId)
        return { testId: doc.testId }
      }
    })

    const res = await fetch(toUrl(randomPath))
    expect(res.status).to.equal(200)
    const content = await res.json()
    expect(content).to.deep.equal({ testId })
  })

  ;['get', 'head', 'post', 'put', 'delete', 'options', 'trace', 'patch'].forEach(method => {
    it(`creates a http ${method.toUpperCase()} route with minimal params`, async () => {
      const createHttpRoute = createHTTPFactory()
      createHttpRoute({
        path: randomPath,
        method,
        run: function () { return null }
      })

      const url = toUrl(randomPath)
      const res = await fetch(url)
      expect(res.status).to.equal(200)
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

  it('does not validate if no schema is defined', async () => {
    const createHttpRoute = createHTTPFactory({ schemaFactory })
    createHttpRoute({
      path: randomPath,
      run: function () {
        return { testId }
      }
    })

    const url = toUrl(randomPath)
    const res = await fetch(url)
    expect(res.status).to.equal(200)
    const content = await res.json()
    expect(content).to.deep.equal({ testId })
  })
  it('allows to validate query using SimpleSchema', async () => {
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

    let res
    const url = toUrl(randomPath)
    res = await fetch(url)
    expect(res.status).to.equal(400)

    const error = await res.json()
    expect(error.title).to.equal('Bad Request')
    expect(error.description).to.equal('Malformed query or body.')
    expect(error.info).to.equal('Other ID is required')

    const query = toUrl(randomPath, { otherId })
    res = await fetch(query)
    expect(res.status).to.equal(200)
    const content = await res.json()
    expect(content).to.deep.equal({ testId, otherId })
  })
  it('allows to validate body using SimpleSchema', async () => {
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

    let url = toUrl(randomPath)
    let res
    res = await fetch(url, { method: 'POST' })
    expect(res.status).to.equal(400)
    const error = await res.json()
    expect(error.title).to.equal('Bad Request')
    expect(error.description).to.equal('Malformed query or body.')
    expect(error.info).to.equal('Other ID is required')

    const otherId = Random.id()
    url = toUrl(randomPath)
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otherId })
    })
    expect(res.status).to.equal(200)
    const content = await res.json()
    expect(content).to.deep.equal({ testId, otherId })
  })
  it('allows to validate query using check/Match', async () => {
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

    let url = toUrl(randomPath)
    let res
    res = await fetch(url, { method: 'GET' })
    expect(res.status).to.equal(400)
    const error = await res.json()
    expect(error.title).to.equal('Bad Request')
    expect(error.description).to.equal('Malformed query or body.')
    expect(error.info).to.equal('Match error: Missing key \'otherId\'')

    url = toUrl(randomPath, { otherId })
    res = await fetch(url, { method: 'GET' })
    expect(res.status).to.equal(200)
    const content = await res.json()
    expect(content).to.deep.equal({ testId, otherId })
  })
  it('allows to validate body using check/Match', async () => {
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

    const otherId = Random.id()
    const url = toUrl(randomPath)
    let res = await fetch(url, { method: 'POST' })
    expect(res.status).to.equal(400)
    const error = await res.json()
    expect(error.title).to.equal('Bad Request')
    expect(error.description).to.equal('Malformed query or body.')
    expect(error.info).to.equal('Match error: Missing key \'otherId\'')

    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otherId })
    })
    expect(res.status).to.equal(200)
    const content = await res.json()
    expect(content).to.deep.equal({ testId, otherId })
  })
  it('allows to override validation using validate', async () => {
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

    const res = await fetch(toUrl(randomPath), {
      method: 'POST'
    })
    expect(res.status).to.equal(200)
    const content = await res.json()
    expect(content).to.deep.equal({ testId })
  })
})

describe('with error handler', function () {
  let randomPath
  let errorId

  beforeEach(function () {
    randomPath = createRandomPath()
    errorId = Random.id()
  })

  it('allows to pass global onError', async () => {
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

    const res = await fetch(toUrl(randomPath))
    expect(res.status).to.equal(500)
    const err = await res.json()
    expect(err.info).to.equal(errorId)
    expect(hooked).to.equal(true)
  })

  it('allows to pass local onError', async () => {
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

    const res = await fetch(toUrl(randomPath))
    expect(res.status).to.equal(500)
    const err = await res.json()
    expect(err.info).to.equal(errorId)
    expect(hooked).to.equal(true)
  })

  it('allows to override global onError with local onError', async () => {
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

    const res = await fetch(toUrl(randomPath))
    expect(res.status).to.equal(500)
    const err = await res.json()
    expect(err.info).to.equal(errorId)
    expect(hooked).to.equal(true)
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
    if (req.header('x-auth-token') !== xAuthToken) {
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
    if (req.header('x-auth-token') !== xAuthToken) {
      // external middleware is neither bound to the environment
      // nor affected in any way, so it can 100% maintain it's logic
      // however, this.error is not available here
      return res.status(403).json({ title: 'Permission Denied' })
    }
    next()
  }

  it('allows to add middleware as external', async () => {
    const createHttpRoute = createHTTPFactory()

    createHttpRoute({
      path: randomPath,
      method: 'post',
      simpleAuth: simpleAuthExternal,
      run: function () {
        return { testId }
      }
    })

    // should not be affected
    const unprotectedPath = createRandomPath()
    createHttpRoute({
      path: unprotectedPath,
      method: 'post',
      run: function () {
        return { testId }
      }
    })

    // unprotected route first
    let res = await fetch(toUrl(unprotectedPath), { method: 'post' })
    expect(res.status).to.equal(200)
    let content = await res.json()
    expect(content).to.deep.equal({ testId })

    // then the protected one without token
    res = await fetch(toUrl(randomPath), { method: 'post' })
    expect(res.status).to.equal(403)
    content = await res.json()
    expect(content).to.deep.equal({ title: 'Permission Denied' })

    // then with token
    const headers = { 'x-auth-token': xAuthToken }
    res = await fetch(toUrl(randomPath), { method: 'post', headers })
    expect(res.status).to.equal(200)
    content = await res.json()
    expect(content).to.deep.equal({ testId })
  })

  it('allows to define middleware as internal', async () => {
    const createHttpRoute = createHTTPFactory()

    createHttpRoute({
      path: randomPath,
      method: 'get',
      run: simpleAuthInternal
    })

    createHttpRoute({
      path: randomPath,
      method: 'get',
      run: function () {
        return { testId }
      }
    })

    // unprotected due to only get-level-scoped middleware
    createHttpRoute({
      path: randomPath,
      method: 'post',
      run: function () {
        return { testId }
      }
    })

    let res = await fetch(toUrl(randomPath), { method: 'post' })
    expect(res.status).to.equal(200)
    let content = await res.json()
    expect(content).to.deep.equal({ testId })

    res = await fetch(toUrl(randomPath))
    expect(res.status).to.equal(403)
    const error = await res.json()
    expect(error.title).to.equal('Permission Denied')

    const headers = { 'x-auth-token': xAuthToken }
    res = await fetch(toUrl(randomPath), { headers })
    expect(res.status).to.equal(200)
    content = await res.json()
    expect(content).to.deep.equal({ testId })
  })

  it('allows to add middleware on a global level', async () => {
    const createHttpRoute = createHTTPFactory({
      simpleAuth: simpleAuthExternal
    })

    createHttpRoute({
      path: randomPath,
      method: 'put',
      run: function () {
        return { testId }
      }
    })

    let res = await fetch(toUrl(randomPath), { method: 'put' })
    expect(res.status).to.equal(403)
    const error = await res.json()
    expect(error).to.deep.equal({ title: 'Permission Denied' })

    const headers = { 'x-auth-token': xAuthToken }
    res = await fetch(toUrl(randomPath), { method: 'put', headers })
    expect(res.status).to.equal(200)
    const content = await res.json()
    expect(content).to.deep.equal({ testId })
  })
})
