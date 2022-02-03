// Since the `@slack/web-api` is generally being mocked when this module is in
// use, we have to treat the types and original implementations separately.
// `Slack` represents the types, while we import the actual objects (which can
// no longer be used as types) are imported via `jest.requireActual`.
import type * as Slack from '@slack/web-api';

const { WebClient } = jest.requireActual<typeof Slack>('@slack/web-api');

/**
 * Creates a new type where functions in the original types are Jest mocks and
 * other values are kept as is, and which works recusively (so if a property
 * is an object with functions, it becomes and object with mocks).
 */
type ObjectWithMocks<Type> = {
  [Property in keyof Type]: Type[Property] extends CallableFunction
    ? jest.Mock<any>
    : Type[Property] extends Record<string, unknown>
    ? ObjectWithMocks<Type[Property]>
    : Type[Property];
};

/** A basic, pre-configured mock for Slack API methods. */
const mockApi = (): jest.Mock => jest.fn().mockResolvedValue({ ok: true });

const primitiveTypes = new Set(['string', 'boolean', 'number', 'undefined']);

/**
 * Make a concrete `ObjectWithMocks` from another object.
 */
function deepCopyWithMocks<T>(original: T): ObjectWithMocks<T> {
  const copy = {} as Record<string, any>;

  // In this situation, we want to include elements from the prototype chain,
  // so we can safely ignore ESLint here.
  // eslint-disable-next-line
  for (const key in original) {
    const value = original[key];
    if (typeof value === 'function') {
      copy[key] = mockApi();
    } else if (primitiveTypes.has(typeof value) || value == null) {
      copy[key] = value;
    } else {
      copy[key] = deepCopyWithMocks(value);
    }
  }

  return copy as ObjectWithMocks<T>;
}

/**
 * `MockWebClient` has same interface as Slack's `WebClient`, but all methods
 * have been replaced with Jest mock functions.
 *
 * See Slack's WebClient source for more on it:
 * https://github.com/slackapi/node-slack-sdk/blob/main/packages/web-api/src/WebClient.ts
 *
 * @example
 * mockInstance.chat.postMessage.mockResolvedValue({
 *   ok: true,
 *   message: {
 *     text: 'Hello World',
 *   },
 * });
 */
export type MockWebClient = ObjectWithMocks<Slack.WebClient>;

type MockConstructor = new (
  token?: string,
  options?: Slack.WebClientOptions,
) => MockWebClient;

export const MockedWebClient: jest.MockedClass<MockConstructor> = jest.fn(
  function makeMockWebClient(this: MockWebClient) {
    const exampleClientInstance = new WebClient();
    const instance = deepCopyWithMocks<Slack.WebClient>(exampleClientInstance);

    // Default for bolt apps
    // https://github.com/slackapi/bolt-js/blob/1655999346077e9521722a667414758da856ede2/src/App.ts#L579
    instance.auth.test.mockResolvedValue({
      ok: true,
      user_id: 'BOT_USER_ID',
      bot_id: 'BOT_ID',
    });

    Object.assign(this, instance);
    return this;
  },
);

const mockWebApi = (jestModule: typeof jest): jest.Mock => {
  const mock: jest.Mock = jestModule.genMockFromModule('@slack/web-api');

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore Based on previous ignore, unsure how to set this to the whole module
  mock.WebClient = MockedWebClient;

  return mock;
};

export default mockWebApi;
