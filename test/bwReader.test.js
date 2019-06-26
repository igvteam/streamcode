const {assert} = require('chai')
const NodeLocalFile = require("../src/io/nodeLocalFile")
const RemoteFile = require("../src/io/remoteFile")
const BWReader = require("../src/bigwig/bwReader")

const dataURL = "https://data.broadinstitute.org/igvdata/test/data/"

suite('BWReader', function () {

    test('test read header', async function () {

        const path = require.resolve("./data/volvox.bw")
        const file = new NodeLocalFile({path: path})
        const bwReader = new BWReader({file: file})
        const header = await bwReader.loadHeader()
        assert.ok(header)

    })

    test('test read features', async function () {

        const path = require.resolve("./data/volvox.bw")
        const file = new NodeLocalFile({path: path})
        const bwReader = new BWReader({file: file})
        const chr = 'ctgA'
        const start = 1
        const end = 25
        const bpPerPixel = 1
        const features = await bwReader.readFeatures(chr, start, end, bpPerPixel)
        assert.ok(features)

    })

    test('uncompressed bw', async function () {

        const url = "https://s3.amazonaws.com/igv.org.test/data/uncompressed.bw"
        const file = new RemoteFile({url: url})

        //chr21:19,146,376-19,193,466
        var chr = "chr21",
            bpStart = 0,
            bpEnd = Number.MAX_SAFE_INTEGER,
            bpPerPixel = 6191354.824;    // To match iOS unit test

        const bwReader = new BWReader({file: file})
        const features = await bwReader.readFeatures(chr, bpStart, bpEnd, bpPerPixel)
        assert.ok(features);
        assert.equal(features.length, 8);   // Verified in iPad app

    })

    test('many chromosomes', async function () {

        this.timeout(60000)
        const url = dataURL + 'bigwig/manyChromosomes.bigWig'
        const file = new RemoteFile({url: url})
        const bwReader = new BWReader({file: file})
        const features = await bwReader.readFeatures('AluJb', 0, 100)
        assert.equal(99, features.length);
        features.forEach(function (f) {
            assert.equal("AluJb", f.chr);
        });
    })

    test('zoom data', async function () {

        const url = dataURL + 'bigwig/bigWigExample.bw'
        const file = new RemoteFile({url: url})
        const bwReader = new BWReader({file: file})

        const chr = "chr21"
        const bpStart = 18728264
        const bpEnd = 26996291
        const bpPerPixel = 10765.6611328125  // To match iOS unit test

        const features = await bwReader.readFeatures(chr, bpStart, bpEnd, bpPerPixel)
        assert.ok(features);
        assert.equal(features.length, 1293);   // Verified in iPad app
    })

    test('bed features', async function () {

        const url = dataURL + 'bigwig/bigBedExample.bb'
        const file = new RemoteFile({url: url})
        const bwReader = new BWReader({file: file})

        const chr = "chr21"
        const bpStart = 33031597
        const bpEnd = 33041570

        const features = await bwReader.readFeatures(chr, bpStart, bpEnd)
        assert.ok(features);
        assert.equal(features.length, 23);   // Verified in iPad app

    })

})