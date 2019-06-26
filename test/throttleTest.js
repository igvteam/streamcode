const {assert} = require('chai')

const RemoteFile = require("../src/io/remoteFile")
const NodeLocalFile = require("../src/io/nodeLocalFile.js")
const RateLimitedFile = require("../src/io/rateLimitedFile")


suite('RateLimitedFile', function () {

    test('test throttled read', async function () {

        this.timeout(600000);

        const wait = 100
        const path = require.resolve("./data/BufferedReaderTest.bin")
        const file = new RateLimitedFile(new NodeLocalFile({path: path}), wait)

        let lastTime = 0
        for (let start = 25; start < 125; start += 10) {
            const range = {start: start, size: 10};
            const arrayBuffer = await file.read(range.start, range.size)
            assert.ok(arrayBuffer);

            const now = Date.now()
            assert.ok(now - lastTime >= wait)
            lastTime = now

            const dataView = new DataView(arrayBuffer);
            for (let i = 0; i < range.size; i++) {
                const expectedValue = -128 + range.start + i;
                const value = dataView.getInt8(i);
                assert.equal(expectedValue, value);
            }
        }
    })

})