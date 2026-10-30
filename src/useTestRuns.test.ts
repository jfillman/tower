import { downloadTestReport, parseJUnitFailures } from './useTestRuns';

describe('downloadTestReport', () => {
  it('names the app, so the backend can read the report through glidepath-api', async () => {
    const fetch = jest.fn(async (_url: string) => new Response('<testsuites/>', { status: 200 }));
    const createObjectURL = jest.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: jest.fn() });
    await downloadTestReport({ fetch }, 'http://backend/api/glidepath', 'boarding-api', { id: '6ae0', workflow: 'w' });
    expect(fetch).toHaveBeenCalledWith('http://backend/api/glidepath/tests/report?id=6ae0&app=boarding-api');
  });
});

describe('parseJUnitFailures', () => {
  it('finds failed and errored cases in nested suites, with the first frame in the team\'s code', () => {
    const r = parseJUnitFailures(`<testsuites>
      <testsuite name="a"><testcase name="x" classname="com.x.FooTest"><failure message="boom">java.lang.AssertionError: boom
        at org.junit.Assert.fail(/usr/lib/jvm/junit.jar:1)
        at com.x.FooTest.bar(FooTest.java:42)</failure></testcase><testcase name="y"/></testsuite>
      <testsuite name="b"><testcase name="z"><error>plain error</error></testcase><testcase name="s"><skipped/></testcase></testsuite>
    </testsuites>`);
    expect(r?.total).toBe(4);
    expect(r?.failures).toEqual([
      expect.objectContaining({ name: 'x', classname: 'com.x.FooTest', message: 'boom', location: 'at com.x.FooTest.bar(FooTest.java:42)' }),
      expect.objectContaining({ name: 'z', classname: undefined, message: 'plain error', location: undefined, detail: 'plain error' }),
    ]);
  });

  it('reads a single <testsuite> root, and refuses what is not JUnit', () => {
    expect(parseJUnitFailures('<testsuite><testcase name="a"/></testsuite>')).toEqual({ total: 1, failures: [] });
    expect(parseJUnitFailures('<html><body>oops</body></html>')).toBeUndefined();
    expect(parseJUnitFailures('not xml <')).toBeUndefined();
  });
});
