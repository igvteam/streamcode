const {assert} = require('chai')
const Tabix = require('@gmod/tabix')
const NodeLocalFile = require("../src/io/nodeLocalFile")
const loadIndex = require('../src/feature/featureFileIndex')

suite('Tabix', function () {

    test("tbi", async function () {
        const indexPath = require.resolve("./data/tabix/volvox.test.vcf.gz.tbi")
        const indexFile = new NodeLocalFile({path: indexPath})
        const ti = await loadIndex(indexFile)
        assert.ok(ti);

        const blocks = await ti.blocksForRange('contigA', 1, 4000)
        assert.equal(blocks.length, 1)
        assert.equal(blocks[0].minv.blockPosition, 0)
        assert.equal(blocks[0].minv.dataPosition, 10431)

        const noBlocks = await ti.blocksForRange('contigA', 7334998796, 8104229566)
        assert.equal(noBlocks.length, 0)

        const noBlocks2 = await ti.blocksForRange('nochr', 0, 1)
        assert.equal(noBlocks2.length, 0)
    })

    test('csi', async () => {

        const ti = await loadIndex(new NodeLocalFile({path: require.resolve('./data/tabix/volvox.test.vcf.gz.csi')}))

        const blocks = await ti.blocksForRange('contigA', 1, 4000)
        assert.equal(blocks.length, 1)
        assert.equal(blocks[0].minv.blockPosition, 0)
        assert.equal(blocks[0].minv.dataPosition, 10431)

        const noBlocks = await ti.blocksForRange('contigA', 7334998796, 8104229566)
        assert.equal(noBlocks.length, 0)


    })





})

