const {assert} = require('chai')
const NodeLocalFile = require("../src/io/nodeLocalFile")
const RemoteFile = require("../src/io/remoteFile")
const FeatureFileReader = require("../src/feature/featureFileReader")

const dataURL = "https://data.broadinstitute.org/igvdata/test/data/"

suite('FeatureReader', function () {


    test("ensgene format", async function () {

        const path = require.resolve("./data/bed/ensGene.test.txt")
        const file = new NodeLocalFile({path: path})

        const config = {
            format: "ensgene",
            indexed: false,
            file: file
        }

        const reader = new FeatureFileReader(config);

        const features = await reader.readFeatures("chr1", 0, Number.MAX_VALUE)

        assert.ok(features);
        assert.equal(features.length, 3);
        assert.equal(features[0].name, 'ENSDART00000164359.1');

    })

    test("UCSC repeat masker format", async function () {

        const path = require.resolve("./data/bed/Low_complexity.rmask")
        const file = new NodeLocalFile({path: path})

        const config = {
            format: "rmsk",
            indexed: false,
            file: file
        }

        const reader = new FeatureFileReader(config);
        const features = await reader.readFeatures("chr1", 0, Number.MAX_VALUE)

        assert.ok(features);
        assert.equal(features.length, 3);

        const f = features[0];
        assert.equal("chr1", f.chr);
        assert.equal(46216, f.start);
        assert.equal(46240, f.end);
        assert.equal(f.repName, 'AT_rich');
    })

    test("GWAS Catalog format", async function () {

        const path = require.resolve("./data/bed/gwasCatalog.test.txt")
        const file = new NodeLocalFile({path: path})

        const config = {
            format: "gwasCatalog",
            indexed: false,
            file: file
        }

        const reader = new FeatureFileReader(config);
        const features = await reader.readFeatures("chr1", 0, Number.MAX_VALUE)

        assert.ok(features);
        assert.equal(features.length, 3);
        assert.equal('rs141175086', features[0].name);

    })

    test("tabix indexed file", async function () {

        const path = require.resolve( "./data/bed/basic_feature_3_columns.bed.gz")
        const file = new NodeLocalFile({path: path})
        const indexPath = require.resolve( "./data/bed/basic_feature_3_columns.bed.gz.tbi")
        const indexFile = new NodeLocalFile({path: indexPath})
        const config = {
            format: "bed",
            file: file,
            indexFile: indexFile
        }
        const chr = "chr1"
        const start = 67661265
        const end = 67662948

        const reader = new FeatureFileReader(config);
        const features = await reader.readFeatures(chr, start, end)
        assert.ok(features);
        assert.equal(features.length, 10);

        for(let f of features) {
            assert.ok(f.end >= start &&  f.start <= end)
        }

    })

    test("tribble indexed file", async function () {

        const path = require.resolve( "./data/vcf/test.vcf")
        const file = new NodeLocalFile({path: path})
        const indexPath = require.resolve( "./data/vcf/test.vcf.idx")
        const indexFile = new NodeLocalFile({path: indexPath})
        const config = {
            format: "bed",
            file: file,
            indexFile: indexFile
        }
        const chr = "20"
        const start = 14000
        const end = 20000

        const reader = new FeatureFileReader(config);
        const features = await reader.readFeatures(chr, start, end)
        assert.ok(features);
        assert.equal(features.length, 2);

        for(let f of features) {
            assert.ok(f.end >= start &&  f.start <= end)
        }

    })



})