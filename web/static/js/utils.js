import R from 'ramda'
import yayson from 'yayson'
import objectKeysToCase from 'object-keys-to-case'
import camelCase from 'camel-case'
import snakeCase from 'snake-case'

const {Store} = yayson()
const store = new Store()

export const casefy = fn => data => {
  if (Array.isArray(data)) {
    return data.map(obj => objectKeysToCase(obj, fn))
  }

  return objectKeysToCase(data, fn)
}

export const camelize =
  casefy(camelCase)

export const snakefy =
  casefy(snakeCase)

export const parseJsonApi = data =>
  store.sync(data)

export const resolveAsJson = async res => {
  const json = await res.json()

  return R.pipe(
    parseJsonApi,
    camelize
  )(json)
}

export const resolveErrorAsJson = async res => {
  throw (await resolveAsJson(res))
}

export const insertChangesetErrors = errors =>
  R.mergeWith(R.concat, errors)

export const jsonApiRequest = request =>
  request
    .then(resolveAsJson)
    .catch(resolveErrorAsJson)

export const apiRequest = request =>
  request
    .then(async res => {
      const json = await res.json()
      return {...json, data: camelize(json.data)}
    })
    .catch(async res => {
      throw (await res.json().then(camelize))
    })
