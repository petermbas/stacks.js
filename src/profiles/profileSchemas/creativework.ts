// @ts-ignore: Could not find a declaration file for module
import inspector from 'schema-inspector'
import { extractProfile } from '../profileTokens'
import { Profile } from '../profile'

const schemaDefinition: {[key: string]: any} = {
  type: 'object',
  properties: {
    '@context': { type: 'string', optional: true },
    '@type': { type: 'string' },
    '@id': { type: 'string', optional: true }
  }
}

export class CreativeWork extends Profile {
  constructor(profile = {}) {
    super(profile)
    this._profile = Object.assign({}, {
      '@type': 'CreativeWork'
    }, this._profile)
  }

  static validateSchema(profile: any, strict = false): boolean {
    schemaDefinition.strict = strict
    return inspector.validate(schemaDefinition, profile)
  }

  static fromToken(token: string, publicKeyOrAddress: string | null = null) {
    const profile = extractProfile(token, publicKeyOrAddress)
    return new CreativeWork(profile)
  }
}