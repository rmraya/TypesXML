/*******************************************************************************
 * Copyright (c) 2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { DOMBuilder } from "../DOMBuilder";
import { SAXParser } from "../SAXParser";
import { XMLDocument } from "../XMLDocument";
import { JsonNodeEvent } from "../json/JsonNodeReader";
import {
    jsonEventsToXmlDocument,
    jsonStreamToContentHandler,
    jsonStringToContentHandler,
    jsonFileToXmlFile,
    jsonStringToXmlFile,
    jsonStreamToXmlFile,
    jsonStreamToXmlStream,
    jsonStringToXmlStream,
    jsonStringToXmlDocument,
    xmlDocumentToJsonEvents,
    xmlStreamToJsonStream,
    xmlStringToJsonEvents,
    xmlStringToJsonStream
} from "../json/JsonConversion";

async function runJsonConversionTests(): Promise<void> {
    const samples: Array<string> = new Array<string>();
    samples.push(
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<!--Before root--><!--Second comment-->' +
        '<!DOCTYPE note [' +
        '<!ENTITY writer "John Doe">' +
        '<!ELEMENT note ANY>' +
        '<!ELEMENT body ANY>' +
        '<!ELEMENT h:header ANY>' +
        '<!ELEMENT child ANY>' +
        '<!ELEMENT empty EMPTY>' +
        ']>' +
        '<note xmlns:h="http://example.com/h" category="memo">' +
        '<h:header><![CDATA[Agenda]]></h:header>' +
        '<body>Don\'t forget &writer; on Monday<?pi instructions?></body>' +
        '<empty />' +
        '</note>'
    );
    samples.push(
        '<?xml version="1.1" encoding="UTF-8" standalone="yes"?>\n' +
        '<root attr1="value1" attr2="value2">' +
        'Text node<child>Inner</child>' +
        '<child xml:lang="en">More text</child>' +
        '<![CDATA[raw <content>]]>' +
        '<?processing data?>' +
        '<!--After content-->' +
        '</root>'
    );

    for (let index: number = 0; index < samples.length; index++) {
        const xmlText: string = samples[index];
        await assertRoundTrip(xmlText, 'Sample ' + (index + 1));
    }

    console.log('JSON conversion tests passed.');
}

async function assertRoundTrip(xmlText: string, label: string): Promise<void> {
    const parser: SAXParser = new SAXParser();
    const domBuilder: DOMBuilder = new DOMBuilder();
    parser.setContentHandler(domBuilder);
    parser.setValidating(false);
    parser.parseString(xmlText);
    const originalDocument: XMLDocument | undefined = domBuilder.getDocument();
    if (!originalDocument) {
        throw new Error('Unable to build original XML document for ' + label);
    }

    const eventsFromString: Array<JsonNodeEvent> = xmlStringToJsonEvents(xmlText);
    const jsonPayloadFromString: string = JSON.stringify(eventsFromString);
    const reconstructedFromString: XMLDocument = jsonStringToXmlDocument(jsonPayloadFromString);
    if (!originalDocument.equals(reconstructedFromString)) {
        throw new Error('XML -> JSON string -> XML comparison failed for ' + label);
    }

    const parsedEvents: Array<JsonNodeEvent> = JSON.parse(jsonPayloadFromString) as Array<JsonNodeEvent>;
    const reconstructedFromEvents: XMLDocument = jsonEventsToXmlDocument(parsedEvents);
    if (!originalDocument.equals(reconstructedFromEvents)) {
        throw new Error('XML -> JSON events -> XML comparison failed for ' + label);
    }

    const eventsFromDocument: Array<JsonNodeEvent> = xmlDocumentToJsonEvents(originalDocument);
    const jsonPayloadFromDocument: string = JSON.stringify(eventsFromDocument);
    const reconstructedFromDocument: XMLDocument = jsonStringToXmlDocument(jsonPayloadFromDocument);
    if (!originalDocument.equals(reconstructedFromDocument)) {
        throw new Error('XMLDocument -> JSON -> XML comparison failed for ' + label);
    }

    const streamedJsonFromString: string = await captureWritableOutput((sink: PassThrough) => {
        return xmlStringToJsonStream(xmlText, sink);
    });
    const eventsFromStreamedString: Array<JsonNodeEvent> = JSON.parse(streamedJsonFromString) as Array<JsonNodeEvent>;
    const rebuiltFromStreamedString: XMLDocument = jsonEventsToXmlDocument(eventsFromStreamedString);
    if (!originalDocument.equals(rebuiltFromStreamedString)) {
        throw new Error('XML -> JSON stream (string source) -> XML comparison failed for ' + label);
    }

    const xmlReadable: Readable = Readable.from([xmlText]);
    const streamedJsonFromReadable: string = await captureWritableOutput(async (sink: PassThrough) => {
        await xmlStreamToJsonStream(xmlReadable, sink);
    });
    const eventsFromStreamedReadable: Array<JsonNodeEvent> = JSON.parse(streamedJsonFromReadable) as Array<JsonNodeEvent>;
    const rebuiltFromStreamedReadable: XMLDocument = jsonEventsToXmlDocument(eventsFromStreamedReadable);
    if (!originalDocument.equals(rebuiltFromStreamedReadable)) {
        throw new Error('XML -> JSON stream (Readable source) -> XML comparison failed for ' + label);
    }

    const domFromJsonString: DOMBuilder = new DOMBuilder();
    jsonStringToContentHandler(jsonPayloadFromString, domFromJsonString);
    const documentFromJsonString: XMLDocument | undefined = domFromJsonString.getDocument();
    if (!documentFromJsonString || !originalDocument.equals(documentFromJsonString)) {
        throw new Error('JSON string -> ContentHandler -> XML comparison failed for ' + label);
    }

    const jsonReadable: Readable = Readable.from([jsonPayloadFromString]);
    const domFromJsonStream: DOMBuilder = new DOMBuilder();
    await jsonStreamToContentHandler(jsonReadable, domFromJsonStream);
    const documentFromJsonStream: XMLDocument | undefined = domFromJsonStream.getDocument();
    if (!documentFromJsonStream || !originalDocument.equals(documentFromJsonStream)) {
        throw new Error('JSON stream -> ContentHandler -> XML comparison failed for ' + label);
    }

    const xmlFromJsonStringStream: string = await captureWritableOutput((sink: PassThrough) => {
        return jsonStringToXmlStream(jsonPayloadFromString, sink);
    });
    const documentFromJsonStringStream: XMLDocument = parseXml(xmlFromJsonStringStream);
    if (!originalDocument.equals(documentFromJsonStringStream)) {
        throw new Error('JSON string -> XML stream -> XML comparison failed for ' + label);
    }

    const xmlFromJsonReadableStream: string = await captureWritableOutput(async (sink: PassThrough) => {
        await jsonStreamToXmlStream(Readable.from([jsonPayloadFromString]), sink);
    });
    const documentFromJsonReadableStream: XMLDocument = parseXml(xmlFromJsonReadableStream);
    if (!originalDocument.equals(documentFromJsonReadableStream)) {
        throw new Error('JSON stream -> XML stream -> XML comparison failed for ' + label);
    }

    const tempDir: string = mkdtempSync(join(tmpdir(), "typesxml-json-"));
    try {
        const jsonStringXmlPath: string = join(tempDir, "from-string.xml");
        await jsonStringToXmlFile(jsonPayloadFromString, jsonStringXmlPath);
        const xmlFromFile: string = readFileSync(jsonStringXmlPath, "utf8");
        const documentFromJsonFile: XMLDocument = parseXml(xmlFromFile);
        if (!originalDocument.equals(documentFromJsonFile)) {
            throw new Error('JSON string -> XML file -> XML comparison failed for ' + label);
        }

        const jsonStreamXmlPath: string = join(tempDir, "from-stream.xml");
        await jsonStreamToXmlFile(Readable.from([jsonPayloadFromString]), jsonStreamXmlPath);
        const xmlFromStreamFile: string = readFileSync(jsonStreamXmlPath, "utf8");
        const documentFromJsonStreamFile: XMLDocument = parseXml(xmlFromStreamFile);
        if (!originalDocument.equals(documentFromJsonStreamFile)) {
            throw new Error('JSON stream -> XML file -> XML comparison failed for ' + label);
        }

        const jsonSourcePath: string = join(tempDir, "source.json");
        writeFileSync(jsonSourcePath, jsonPayloadFromString, "utf8");
        const jsonFileXmlPath: string = join(tempDir, "from-json-file.xml");
        await jsonFileToXmlFile(jsonSourcePath, jsonFileXmlPath);
        const xmlFromJsonFile: string = readFileSync(jsonFileXmlPath, "utf8");
        const documentFromJsonFileSource: XMLDocument = parseXml(xmlFromJsonFile);
        if (!originalDocument.equals(documentFromJsonFileSource)) {
            throw new Error('JSON file -> XML file -> XML comparison failed for ' + label);
        }
    } finally {
        rmSync(tempDir, { recursive: true, force: true });
    }
}

function captureWritableOutput(callback: (sink: PassThrough) => Promise<void> | void): Promise<string> {
    const sink: PassThrough = new PassThrough();
    sink.setEncoding("utf8");
    const chunks: Array<string> = new Array<string>();
    sink.on("data", (chunk: string) => {
        chunks.push(chunk);
    });
    const completion: Promise<void> = new Promise((resolve, reject) => {
        sink.once("end", resolve);
        sink.once("error", reject);
    });
    const result: Promise<void> | void = callback(sink);
    return Promise.resolve(result).then(() => completion).then(() => chunks.join(""));
}

function parseXml(xmlText: string): XMLDocument {
    const parser: SAXParser = new SAXParser();
    const builder: DOMBuilder = new DOMBuilder();
    parser.setContentHandler(builder);
    parser.setValidating(false);
    parser.parseString(xmlText);
    const document: XMLDocument | undefined = builder.getDocument();
    if (!document) {
        throw new Error("Unable to parse XML text");
    }
    return document;
}

runJsonConversionTests().catch((error: unknown) => {
    console.error('JSON conversion tests failed:', error);
    process.exitCode = 1;
});
