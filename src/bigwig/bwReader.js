const BufferedFile = require('../io/bufferedFile.js')
const BinaryParser = require('../util/binary.js')
const zlib = require('zlib')

const BIGWIG_MAGIC_LTH = 0x888FFC26; // BigWig Magic Low to High
const BIGWIG_MAGIC_HTL = 0x26FC8F66; // BigWig Magic High to Low
const BIGBED_MAGIC_LTH = 0x8789F2EB; // BigBed Magic Low to High
const BIGBED_MAGIC_HTL = 0xEBF28987; // BigBed Magic High to Low
const BBFILE_HEADER_SIZE = 64;
const RPTREE_HEADER_SIZE = 48;
const RPTREE_NODE_LEAF_ITEM_SIZE = 32;   // leaf item size
const RPTREE_NODE_CHILD_ITEM_SIZE = 24;  // child item size
const BUFFER_SIZE = 512000;     //  buffer
const BPTREE_HEADER_SIZE = 32;

class BWReader {

    constructor(args) {
        this.file = args.file;
        this.rpTreeCache = {};
        this.config = args;
    };

    async readFeatures(chr1, bpStart, bpEnd, bpPerPixel) {
        return this.readFeatures2(chr1, bpStart, chr1, bpEnd, bpPerPixel)
    }

    async readFeatures2(chr1, bpStart, chr2, bpEnd, bpPerPixel) {

        const zoomLevelHeaders = await this.getZoomHeaders()

        // Select a biwig "zoom level" appropriate for the current resolution
        const zoomLevelHeader = zoomLevelForScale(bpPerPixel, zoomLevelHeaders)

        let decodeFunction
        let treeOffset
        if (zoomLevelHeader) {
            treeOffset = zoomLevelHeader.indexOffset;
            decodeFunction = decodeZoomData;
        } else {
            treeOffset = this.header.fullIndexOffset;
            if (this.type === "BigWig") {
                decodeFunction = decodeWigData;
            } else {
                decodeFunction = decodeBedData;
            }
        }

        const rpTree = await this.getRPTree(treeOffset);

        let leafItems
        const chrIdx1 = this.bpTree.chromToID[chr1];
        const chrIdx2 = this.bpTree.chromToID[chr2];
        if (chrIdx1 === undefined || chrIdx2 === undefined) {
            leafItems = undefined;
        } else {
            leafItems = await rpTree.findLeafItemsOverlapping(chrIdx1, bpStart, chrIdx2, bpEnd)
        }


        if (!leafItems || leafItems.length == 0) {
            return [];

        } else {

            // Consolidate leaf items and get all data at once
            let start = Number.MAX_VALUE;
            let end = 0;
            for (let item of leafItems) {
                start = Math.min(start, item.dataOffset);
                end = Math.max(end, item.dataOffset + item.dataSize);
            }
            const size = end - start;
            const arrayBuffer = await this.file.read(start, size)

            const allFeatures = [];
            for (let item of leafItems) {

                const dataView = Buffer.from(arrayBuffer, item.dataOffset - start, item.dataSize)

                let plain;
                const isCompressed = this.header.uncompressBuffSize > 0;
                if (isCompressed) {
                    const inflated = zlib.inflateSync(dataView)   //.decompress();
                    plain = inflated.buffer;

                } else {
                    plain = dataView.buffer;
                }

                decodeFunction(new DataView(plain), chrIdx1, bpStart, chrIdx2, bpEnd, allFeatures, this.bpTree.idToChrom);
            }

            allFeatures.sort(function (a, b) {
                return a.start - b.start;
            })

            return allFeatures;
        }
    }

    async getZoomHeaders() {
        if (this.zoomLevelHeaders) {
            return this.zoomLevelHeaders;
        } else {
            await this.loadHeader()
            return this.zoomLevelHeaders;
        }
    }

    async loadHeader() {

        if (this.header) {
            return this.header;
        } else {

            const data = await this.file.read(0, BBFILE_HEADER_SIZE)


            // Assume low-to-high unless proven otherwise
            this.littleEndian = true;

            const dataView = new DataView(data)
            const binaryParser = new BinaryParser(dataView);

            let magic = binaryParser.getUInt();

            if (magic === BIGWIG_MAGIC_LTH) {
                this.type = "BigWig";
            } else if (magic == BIGBED_MAGIC_LTH) {
                this.type = "BigBed";
            } else {
                //Try big endian order
                this.littleEndian = false;
                binaryParser.littleEndian = false;
                binaryParser.position = 0;
                magic = binaryParser.getUInt();
                if (magic === BIGWIG_MAGIC_HTL) {
                    this.type = "BigWig";
                } else if (magic == BIGBED_MAGIC_HTL) {
                    this.type = "BigBed";
                } else {
                    // TODO -- error, unknown file type  or BE
                }
            }
            // Table 5  "Common header for BigWig and BigBed files"
            const header = {};
            header.bwVersion = binaryParser.getUShort();
            header.nZoomLevels = binaryParser.getUShort();
            header.chromTreeOffset = binaryParser.getLong();
            header.fullDataOffset = binaryParser.getLong();
            header.fullIndexOffset = binaryParser.getLong();
            header.fieldCount = binaryParser.getUShort();
            header.definedFieldCount = binaryParser.getUShort();
            header.autoSqlOffset = binaryParser.getLong();
            header.totalSummaryOffset = binaryParser.getLong();
            header.uncompressBuffSize = binaryParser.getInt();
            header.reserved = binaryParser.getLong();
            this.header = header

            await this.loadZoomHeadersAndChrTree();
            return this.header

        }

    }

    async loadZoomHeadersAndChrTree() {

        const startOffset = BBFILE_HEADER_SIZE;
        const data = await this.file.read(startOffset, (this.header.fullDataOffset - startOffset + 5))

        const nZooms = this.header.nZoomLevels;
        const binaryParser = new BinaryParser(new DataView(data));

        this.zoomLevelHeaders = [];
        this.firstZoomDataOffset = Number.MAX_VALUE;
        for (let i = 1; i <= nZooms; i++) {
            const zoomNumber = nZooms - i;
            const zlh = new ZoomLevelHeader(zoomNumber, binaryParser);
            this.firstZoomDataOffset = Math.min(zlh.dataOffset, this.firstZoomDataOffset);
            this.zoomLevelHeaders[zoomNumber] = zlh;
        }

        // Autosql
        if (this.header.autoSqlOffset > 0) {
            binaryParser.position = this.header.autoSqlOffset - startOffset;
            this.autoSql = binaryParser.getString();
        }

        // Total summary
        if (this.header.totalSummaryOffset > 0) {
            binaryParser.position = this.header.totalSummaryOffset - startOffset;
            this.totalSummary = new BWTotalSummary(binaryParser);
        }

        // Chrom data index
        if (this.header.chromTreeOffset > 0) {
            binaryParser.position = this.header.chromTreeOffset - startOffset;
            this.bpTree = new BPTree(binaryParser, startOffset, this.config.genome);
        } else {
            // TODO -- this is an error, not expected
            throw "BigWig B+ tree offset <= 0";
        }

        //Finally total data count
        binaryParser.position = this.header.fullDataOffset - startOffset;
        this.header.dataCount = binaryParser.getInt();

    }


    async getRPTree(offset) {

        const self = this;

        let rpTree = self.rpTreeCache[offset];
        if (rpTree) {
            return rpTree;
        } else {
            rpTree = new RPTree(offset, self.config, self.littleEndian);

            return rpTree.load()
                .then(function () {
                    self.rpTreeCache[offset] = rpTree;
                    return rpTree;
                })
        }
    }
}

function ZoomLevelHeader(index, byteBuffer) {
    this.index = index;
    this.reductionLevel = byteBuffer.getInt();
    this.reserved = byteBuffer.getInt();
    this.dataOffset = byteBuffer.getLong();
    this.indexOffset = byteBuffer.getLong();

}

class RPTree {

    constructor(
        fileOffset, config, littleEndian) {

        this.config = config;
        this.fileOffset = fileOffset; // File offset to beginning of tree
        this.path = config.url;
        this.littleEndian = littleEndian;
    }

    load() {

        const self = this;

        const rootNodeOffset = self.fileOffset + RPTREE_HEADER_SIZE,
            bufferedFile = new BufferedFile({
                file: this.config.file,
                size: BUFFER_SIZE
            });

        return self.readNode(rootNodeOffset, bufferedFile)

            .then(function (node) {
                self.rootNode = node;
                return self;
            })
    }

    async readNode(filePosition, bufferedFile) {

        const self = this;

        let data = await bufferedFile.read(filePosition, 4)
        let dataView = new DataView(data)

        let binaryParser = new BinaryParser(dataView, this.littleEndian);
        const type = binaryParser.getByte();
        const isLeaf = (type === 1) ? true : false;
        const reserved = binaryParser.getByte();
        const count = binaryParser.getUShort();

        filePosition += 4;

        const bytesRequired = count * (isLeaf ? RPTREE_NODE_LEAF_ITEM_SIZE : RPTREE_NODE_CHILD_ITEM_SIZE);
        data = await bufferedFile.read(filePosition, bytesRequired)
        dataView = new DataView(data)


        const items = new Array(count)
        binaryParser = new BinaryParser(dataView, this.littleEndian);

        if (isLeaf) {
            for (let i = 0; i < count; i++) {
                const item = {
                    isLeaf: true,
                    startChrom: binaryParser.getInt(),
                    startBase: binaryParser.getInt(),
                    endChrom: binaryParser.getInt(),
                    endBase: binaryParser.getInt(),
                    dataOffset: binaryParser.getLong(),
                    dataSize: binaryParser.getLong()
                };
                items[i] = item;

            }
            return new RPTreeNode(items);
        } else { // non-leaf
            for (let i = 0; i < count; i++) {

                const item = {
                    isLeaf: false,
                    startChrom: binaryParser.getInt(),
                    startBase: binaryParser.getInt(),
                    endChrom: binaryParser.getInt(),
                    endBase: binaryParser.getInt(),
                    childOffset: binaryParser.getLong()
                };
                items[i] = item;

            }

            return new RPTreeNode(items);
        }

    }

    async findLeafItemsOverlapping(chrIdx1, startBase, chrIdx2, endBase) {

        const self = this;

        return new Promise(function (fulfill, reject) {

            const leafItems = [],
                processing = new Set(),
                bufferedReader = new BufferedFile({
                    file: self.config.file,
                    size: BUFFER_SIZE
                })

            processing.add(0);  // Zero represents the root node
            findLeafItems(self.rootNode, 0);

            async function findLeafItems(node, nodeId) {

                if (overlaps(node, chrIdx1, startBase, chrIdx2, endBase)) {

                    const items = node.items;

                    for (let item of items) {

                        if (overlaps(item, chrIdx1, startBase, chrIdx2, endBase)) {

                            if (item.isLeaf) {
                                leafItems.push(item);
                            } else {
                                if (item.childNode) {
                                    findLeafItems(item.childNode);
                                } else {
                                    processing.add(item.childOffset);  // Represent node to-be-loaded by its file position
                                    const node = await self.readNode(item.childOffset, bufferedReader)
                                    item.childNode = node;
                                    findLeafItems(node, item.childOffset);

                                }
                            }
                        }
                    }

                }

                if (nodeId != undefined) processing.delete(nodeId);

                // Wait until all nodes are processed
                if (processing.size === 0) {
                    fulfill(leafItems);
                }
            }
        });
    }
}

function RPTreeNode(items) {

    this.items = items;

    let minChromId = Number.MAX_VALUE
    let maxChromId = 0
    let minStartBase = Number.MAX_VALUE
    let maxEndBase = 0


    for (let i = 0; i < items.length; i++) {
        item = items[i];
        minChromId = Math.min(minChromId, item.startChrom);
        maxChromId = Math.max(maxChromId, item.endChrom);
        minStartBase = Math.min(minStartBase, item.startBase);
        maxEndBase = Math.max(maxEndBase, item.endBase);
    }

    this.startChrom = minChromId;
    this.endChrom = maxChromId;
    this.startBase = minStartBase;
    this.endBase = maxEndBase;

}

function BPTree(binaryParser, startOffset, genome) {

    const magic = binaryParser.getInt();
    const blockSize = binaryParser.getInt();
    const keySize = binaryParser.getInt();
    const valSize = binaryParser.getInt();
    const itemCount = binaryParser.getLong();
    const reserved = binaryParser.getLong();
    const chromToId = {};
    const idToChrom = [];

    this.header = {
        magic: magic,
        blockSize: blockSize,
        keySize: keySize,
        valSize: valSize,
        itemCount: itemCount,
        reserved: reserved
    };
    this.chromToID = chromToId;
    this.idToChrom = idToChrom;

    // Recursively walk tree to populate dictionary
    readTreeNode(binaryParser, -1);

    function readTreeNode(byteBuffer, offset) {

        if (offset >= 0) byteBuffer.position = offset;

        const type = byteBuffer.getByte()
        const reserved = byteBuffer.getByte()
        const count = byteBuffer.getUShort()


        if (type == 1) {

            for (let i = 0; i < count; i++) {

                let key = byteBuffer.getFixedLengthTrimmedString(keySize);
                const chromId = byteBuffer.getInt();
                const chromSize = byteBuffer.getInt();

                if (genome) {
                    key = genome.getChromosomeName(key);
                }
                // Translate to canonical chr name
                chromToId[key] = chromId;
                idToChrom[chromId] = key;

            }
        } else { // non-leaf

            for (i = 0; i < count; i++) {

                key = byteBuffer.getFixedLengthTrimmedString(keySize);
                const childOffset = byteBuffer.getLong();
                const bufferOffset = childOffset - startOffset;
                const currOffset = byteBuffer.position;
                readTreeNode(byteBuffer, bufferOffset);
                byteBuffer.position = currOffset;
            }
        }

    }
}

/**
 * Return true if {chrIdx1:startBase-chrIdx2:endBase} overlaps item's interval
 * @returns {boolean}
 */
function overlaps(item, chrIdx1, startBase, chrIdx2, endBase) {

    if (!item) {
        console.log("null item for " + chrIdx1 + " " + startBase + " " + endBase);
        return false;
    }

    return ((chrIdx2 > item.startChrom) || (chrIdx2 == item.startChrom && endBase >= item.startBase)) &&
        ((chrIdx1 < item.endChrom) || (chrIdx1 == item.endChrom && startBase <= item.endBase));


}

function BWTotalSummary(byteBuffer) {

    if (byteBuffer) {

        this.basesCovered = byteBuffer.getLong();
        this.minVal = byteBuffer.getDouble();
        this.maxVal = byteBuffer.getDouble();
        this.sumData = byteBuffer.getDouble();
        this.sumSquares = byteBuffer.getDouble();

        computeStats.call(this);
    } else {
        this.basesCovered = 0;
        this.minVal = 0;
        this.maxVal = 0;
        this.sumData = 0;
        this.sumSquares = 0;
        this.mean = 0;
        this.stddev = 0;
    }
}


BWTotalSummary.prototype.updateStats = function (stats) {

    this.basesCovered += stats.count;
    this.sumData += status.sumData;
    this.sumSquares += sumSquares;
    this.minVal = MIN(_minVal, min);
    this.maxVal = MAX(_maxVal, max);

    computeStats.call(this);

}

function computeStats() {
    const n = this.basesCovered;
    if (n > 0) {
        this.mean = this.sumData / n;
        this.stddev = Math.sqrt(this.sumSquares / (n - 1));

        const min = this.minVal < 0 ? this.mean - 2 * this.stddev : 0,
            max = this.maxVal > 0 ? this.mean + 2 * this.stddev : 0;

        this.defaultRange = {
            min: 0,
            max: this.mean + 3 * this.stddev
        }
    }
}

function zoomLevelForScale(bpPerPixel, zoomLevelHeaders) {

    let level
    for (let i = 0; i < zoomLevelHeaders.length; i++) {
        const zl = zoomLevelHeaders[i];
        if (zl.reductionLevel < bpPerPixel) {
            level = zl;
            break;
        }
    }
    return level;
}

function decodeWigData(data, chrIdx1, bpStart, chrIdx2, bpEnd, featureArray, chrDict) {

    let binaryParser = new BinaryParser(data),
        chromId = binaryParser.getInt(),
        chromStart = binaryParser.getInt(),
        chromEnd = binaryParser.getInt(),
        itemStep = binaryParser.getInt(),
        itemSpan = binaryParser.getInt(),
        type = binaryParser.getByte(),
        reserved = binaryParser.getByte(),
        itemCount = binaryParser.getUShort()

    if (chromId >= chrIdx1 && chromId <= chrIdx2) {
        while (itemCount-- > 0) {
            let value
            switch (type) {
                case 1:
                    chromStart = binaryParser.getInt();
                    chromEnd = binaryParser.getInt();
                    value = binaryParser.getFloat();
                    break;
                case 2:
                    chromStart = binaryParser.getInt();
                    value = binaryParser.getFloat();
                    chromEnd = chromStart + itemSpan;
                    break;
                case 3:  // Fixed step
                    value = binaryParser.getFloat();
                    chromEnd = chromStart + itemSpan;
                    chromStart += itemStep;
                    break;

            }

            // Note we must read all values to advance pointer even if this feature is skipped, thus the test is here
            if (chromId < chrIdx1 || (chromId === chrIdx1 && chromEnd < bpStart)) continue;
            else if (chromId > chrIdx2 || (chromId === chrIdx2 && chromStart >= bpEnd)) break;

            if (Number.isFinite(value)) {
                const chr = chrDict[chromId];
                featureArray.push({chr: chr, start: chromStart, end: chromEnd, value: value});

            }
        }
    }
}


function decodeBedData(data, chrIdx1, bpStart, chrIdx2, bpEnd, featureArray, chrDict) {

    const binaryParser = new BinaryParser(data)
    const minSize = 3 * 4 + 1   // Minimum # of bytes required for a bed record

    while (binaryParser.remLength() >= minSize) {

        const chromId = binaryParser.getInt();
        const chr = chrDict[chromId];
        const chromStart = binaryParser.getInt();
        const chromEnd = binaryParser.getInt();
        const rest = binaryParser.getString();

        // Note we must read all values to advance pointer even if this feature is skipped, thus the test is here
        if (chromId < chrIdx1 || (chromId === chrIdx1 && chromEnd < bpStart)) continue;
        else if (chromId > chrIdx2 || (chromId === chrIdx2 && chromStart >= bpEnd)) break;

        const feature = {chr: chr, start: chromStart, end: chromEnd};

        featureArray.push(feature);

        const tokens = rest.split("\t");

        if (tokens.length > 0) {
            feature.name = tokens[0];
        }
        if (tokens.length > 1) {
            feature.score = parseFloat(tokens[1]);
        }
        if (tokens.length > 2) {
            feature.strand = tokens[2];
        }
        if (tokens.length > 3) {
            feature.cdStart = parseInt(tokens[3]);
        }
        if (tokens.length > 4) {
            feature.cdEnd = parseInt(tokens[4]);
        }
        if (tokens.length > 5) {
            feature.color = tokens[5];
        }
        if (tokens.length > 8) {
            const exonCount = parseInt(tokens[6]);
            const exonSizes = tokens[7].split(',');
            const exonStarts = tokens[8].split(',');
            const exons = [];

            for (let i = 0; i < exonCount; i++) {
                const eStart = chromStart + parseInt(exonStarts[i]);
                const eEnd = eStart + parseInt(exonSizes[i]);
                exons.push({start: eStart, end: eEnd});
            }
            feature.exons = exons;
        }
    }
}


function decodeZoomData(data, chrIdx1, bpStart, chrIdx2, bpEnd, featureArray, chrDict) {

    const binaryParser = new BinaryParser(data),
        minSize = 8 * 4   // Minimum # of bytes required for a zoom record


    while (binaryParser.remLength() >= minSize) {

        const chromId = binaryParser.getInt()
        const chromStart = binaryParser.getInt()
        const chromEnd = binaryParser.getInt()
        const chr = chrDict[chromId]
        const validCount = binaryParser.getInt();
        const minVal = binaryParser.getFloat();
        const maxVal = binaryParser.getFloat();
        const sumData = binaryParser.getFloat();
        const sumSquares = binaryParser.getFloat();

        // Note we must read all values to advance pointer even if this feature is skipped, thus the test is here
        if (chromId < chrIdx1 || (chromId === chrIdx1 && chromEnd < bpStart)) continue
        if (chromId > chrIdx2 || (chromId === chrIdx2 && chromStart >= bpEnd)) break

        const value = validCount == 0 ? 0 : sumData / validCount;


        if (Number.isFinite(value)) {
            featureArray.push({
                chr: chr,
                start: chromStart,
                end: chromEnd,
                value: value,
                validCount: validCount,
                minVal: minVal,
                maxVal: maxVal,
                sumData: sumData,
                sumSquares: sumSquares
            })
        }
    }
}

module.exports = BWReader

//export default BWReader