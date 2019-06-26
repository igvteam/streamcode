const {assert} = require('chai')
const NodeLocalFile = require("../src/io/nodeLocalFile")
const unbgzf = require("../src/util/bgzip")


suite('bgzip', function () {
    test("bgzip", async function () {
        const path = require.resolve("./data/bed/basic_feature_3_columns.bed.gz")
        const file = new NodeLocalFile({path: path})
        const arrayBuffer = await file.read()
        const unzipped =  unbgzf(arrayBuffer)  //zlib.gunzipSync(Buffer.from(arrayBuffer)) //
        assert.ok(unzipped)
    })
})

