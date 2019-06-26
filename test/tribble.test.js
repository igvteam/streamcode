const {assert} = require('chai')
const NodeLocalFile = require("../src/io/nodeLocalFile")
const RemoteFile = require("../src/io/remoteFile")
const FeatureFileReader = require("../src/feature/featureFileReader")
const loadIndex = require("../src/feature/featureFileIndex")
const unbgzf = require("../src/util/bgzip")
const getDataWrapper = require("../src/util/dataWrapper")
const zlib = require('zlib')

suite('Tabix', function () {

    test("tribble index", async function () {
        const indexPath = require.resolve("./data/vcf/test.vcf.idx")
        const indexFile = new NodeLocalFile({path: indexPath})
        const tribbleIndex = await loadIndex(indexFile)
        assert.ok(tribbleIndex);

        const blocks = await tribbleIndex.blocksForRange("20", 14000, 15000)
        assert.ok(blocks)

    })




})

