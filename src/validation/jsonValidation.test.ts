import { describe, expect, it, vi } from 'vitest'
import { fetchAndParseJson } from './jsonValidation'

function fakeFetch(response: { ok: boolean; status?: number; statusText?: string; body: unknown }) {
  return async () =>
    ({
      ok: response.ok,
      status: response.status ?? 200,
      statusText: response.statusText ?? '',
      json: async () => response.body,
    }) as Response
}

describe('fetchAndParseJson', () => {
  it('resolves with the parsed value when the fetch succeeds and parse accepts the body', async () => {
    const body = { hello: 'world' }
    const parse = vi.fn((raw: unknown) => ({ ...(raw as object), parsed: true }))

    const result = await fetchAndParseJson('/thing.json', parse, fakeFetch({ ok: true, body }))

    expect(parse).toHaveBeenCalledWith(body)
    expect(result).toEqual({ hello: 'world', parsed: true })
  })

  it('rejects with a clear error when the HTTP response is not ok, without calling parse', async () => {
    const parse = vi.fn()

    await expect(
      fetchAndParseJson('/thing.json', parse, fakeFetch({ ok: false, status: 404, statusText: 'Not Found', body: null })),
    ).rejects.toThrow(/Failed to load \/thing\.json: 404 Not Found/)
    expect(parse).not.toHaveBeenCalled()
  })

  it('rejects with a clear error when the response body is not valid JSON, without calling parse', async () => {
    const parse = vi.fn()
    const brokenFetch = async () =>
      ({
        ok: true,
        status: 200,
        statusText: '',
        json: async () => {
          throw new Error('unexpected token')
        },
      }) as unknown as Response

    await expect(fetchAndParseJson('/thing.json', parse, brokenFetch)).rejects.toThrow(
      /Failed to parse \/thing\.json as JSON/,
    )
    expect(parse).not.toHaveBeenCalled()
  })

  it('propagates errors thrown by the parse function unchanged', async () => {
    class CustomValidationError extends Error {}
    const parse = () => {
      throw new CustomValidationError('bad shape')
    }

    await expect(
      fetchAndParseJson('/thing.json', parse, fakeFetch({ ok: true, body: { not: 'valid' } })),
    ).rejects.toBeInstanceOf(CustomValidationError)
  })
})
