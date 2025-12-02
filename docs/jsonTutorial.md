# JSON and XML Conversion Guide

TypesXML exposes helpers for lossless conversions between XML and a JSON event format. The snippets below assume you import everything from the library entry point (`import { ... } from "typesxml";`). Replace file paths and stream instances with your own values.

## JSON → XML

### Convert a JSON value to an `XMLDocument`

```ts
import { JsonNodeEvent, jsonEventsToXmlDocument, jsonStringToXmlDocument } from "typesxml";

const jsonText: string = "[{\"type\":\"startDocument\"},{\"type\":\"endDocument\"}]";
const events: Array<JsonNodeEvent> = JSON.parse(jsonText) as Array<JsonNodeEvent>;
const document: XMLDocument = jsonEventsToXmlDocument(events);

const documentFromString: XMLDocument = jsonStringToXmlDocument(jsonText);
```

### Convert a JSON file to an XML file

```ts
import { jsonFileToXmlFile } from "typesxml";

await jsonFileToXmlFile("input.json", "output.xml");
```

### Convert a JSON stream to an XML file

```ts
import { jsonStreamToXmlFile } from "typesxml";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

const source: Readable = createReadStream("large.json", { encoding: "utf8" });
await jsonStreamToXmlFile(source, "large.xml");
```

## XML → JSON

### Convert an `XMLDocument` to a JSON value

```ts
import { JsonNodeEvent, xmlDocumentToJsonEvents } from "typesxml";

function documentToJsonValue(xmlDocument: XMLDocument): any {
  const events: Array<JsonNodeEvent> = xmlDocumentToJsonEvents(xmlDocument);
  const jsonValue: any = events as any;
  return jsonValue;
}

const jsonValue: any = documentToJsonValue(xmlDocument);
const jsonText: string = JSON.stringify(jsonValue, null, 2);
```

### Convert an XML file to a JSON file

```ts
import { xmlFileToJsonStream } from "typesxml";
import { createWriteStream } from "node:fs";
import { Writable } from "node:stream";

const sink: Writable = createWriteStream("output.json", { encoding: "utf8" });
await xmlFileToJsonStream("input.xml", sink);
```

### Convert an XML stream to a JSON file

```ts
import { xmlStreamToJsonStream } from "typesxml";
import { createReadStream, createWriteStream } from "node:fs";
import { Readable, Writable } from "node:stream";

const source: Readable = createReadStream("large.xml", { encoding: "utf8" });
const sink: Writable = createWriteStream("large.json", { encoding: "utf8" });
await xmlStreamToJsonStream(source, sink);
```

### Notes

- Streaming helpers return a `Promise` that resolves when the target stream finishes writing.
- The JSON representation is an array of event objects that preserves every XML detail (declaration, DTD, comments, CDATA, etc.). Use `jsonEventsToXmlDocument` or the streaming helpers to reverse the process whenever you need the original XML.
