"use strict;"
const loadIndex = require("./featureFileIndex")
const unbgzf = require("../util/bgzip")
const FeatureParser = require("./featureParsers")
const MAX_GZIP_BLOCK_SIZE = (1 << 16);

/**
 * Reader for tab delimited files with 1 feature per line (bed, gff, vcf, etc)
 *
 * @param config
 * @constructor
 */
class FeatureFileReader {

    constructor(args) {

        this.config = args
        this.file = args.file
        this.indexFile = args.indexFile
        this.format = this.config.format;
        this.parser = this.getParser(this.format, this.config.decode);
    };


    /**
     * Return a promise to load features for the genomic interval
     * @param chr
     * @param start
     * @param end
     */

    async readFeatures(chr, start, end) {

        const index = await this.getIndex()
        if (index) {
            return this.loadFeaturesWithIndex(chr, start, end);
            // } else if (this.dataURI) {
            //     return this.loadFeaturesFromDataURI();
        } else {
            return this.loadFeaturesNoIndex()
        }
    }

    async readHeader() {

        var that = this;

        if (this.header) {
            return this.header;
        } else {

            const index = await this.getIndex()


            var options,
                success;
            // if (that.dataURI) {
            //
            //     return that.loadFeaturesFromDataURI(that.dataURI)
            //         .then(function (features) {
            //             var header = that.header || {};
            //             header.features = features;
            //             return header;
            //         })
            // } else
            if (index) {

                // Load the file header (not HTTP header) for an indexed file.
                // TODO -- we need a better solution here, this will fail if header exceeds max size.   This however is unlikely.
                let maxSize = "vcf" === that.config.format ? 65000 : 1000;
                if (that.config.filename && that.config.filename.endsWith(".gz")) maxSize /= 2;
                const data = this.file.read(0, maxSize)
                that.header = that.parser.parseHeader(data);
                return that.header

            } else {
                // If this is a non-indexed file we will load all features in advance
                const features = await that.loadFeaturesNoIndex()

                var header = that.header || {};
                header.features = features;

                if (header && that.parser) {
                    that.parser.header = header;
                }
                return header;
            }
        }
    }

    getParser(format, decode) {

        // switch (format) {
        //     case "vcf":
        //         return new igv.VcfParser();
        //     case "seg" :
        //         return new igv.SegParser();
        //     default:
        return new FeatureParser(format, decode, this.config);
        //  }

    };

    async loadFeaturesNoIndex() {

        //var options = igv.buildOptions(that.config);    // Add oauth token, if any
        const data = await this.file.read()
        this.header = this.parser.parseHeader(data);
        if (this.header instanceof String && this.header.startsWith("##gff-version 3")) {
            this.format = 'gff3';
        }
        const dataView = new Uint8Array(data)
        return this.parser.parseFeatures(dataView);
    };

    /**
     * Return a Promise for the index
     */
    async getIndex() {
        if (!this.indexFile) return undefined
        if (!this.index) {
            this.index = await loadIndex(this.indexFile)
        }
        return this.index
    }

    async loadFeaturesWithIndex(chr, start, end) {

        const allFeatures = []
        const tabix = this.index.tabix

        if (tabix) {
            const refId = this.index.sequenceIndexMap[chr]
            const blocks = this.index.blocksForRange(refId, start, end);
            for (let block of blocks) {
                const startPos = block.minv.blockPosition
                const startOffset = block.minv.dataPosition
                const endPos = block.maxv.blockPosition + MAX_GZIP_BLOCK_SIZE;
                const data = await this.file.read(startPos, endPos - startPos + 1)
                const inflated = new Uint8Array(unbgzf(data));
                const slicedData = startOffset ? inflated.slice(startOffset) : inflated;
                const slicedFeatures = this.parser.parseFeatures(slicedData);

                // Filter features not in requested range.  Features within a block should be sorted by start position
                for (let i = 0; i < slicedFeatures.length; i++) {
                    const f = slicedFeatures[i];
                    if (f.start > end) break;
                    if (f.end >= start && f.start <= end) {
                        allFeatures.push(f);
                    }
                }
            }
        } else {
            // Tribble
            const blocks = await this.index.blocksForRange(chr, start, end)
            for (let block of blocks) {
                const slicedData = await this.file.read(block.dataPosition, block.length)
                const slicedFeatures = this.parser.parseFeatures(new Uint8Array(slicedData))

                // Filter features not in requested range.  Features within a block should be sorted by start position
                for (let i = 0; i < slicedFeatures.length; i++) {
                    const f = slicedFeatures[i];
                    if (f.start > end) break;
                    if (f.end >= start && f.start <= end) {
                        allFeatures.push(f);
                    }
                }
            }
        }

        allFeatures.sort(function (a, b) {
            return a.start - b.start;
        });

        return allFeatures;
    }


}

module.exports = FeatureFileReader
