import * as dotenv from "dotenv";
dotenv.config();

import { Handler, HandlerEvent } from "@netlify/functions";
import { Blob, File, FilebaseClient } from "@filebase/client";
import amqp from "amqplib";
import busboy from "busboy";
import { StatusCodes } from "http-status-codes";

const { FILEBASE_TOKEN, AMQP_URL, AMQP_EXCHANGE } = process.env;

const PARENT_NAME_KEY = "###";
const PARENT_FILETYPE = "application/json";

const filebase = new FilebaseClient({ token: FILEBASE_TOKEN });

const genUri = (cid: string, filename?: string) =>
  `/${cid}` + (filename ? `/${filename}` : "");

type FormElement =
  | { isFile: true; filename: string; mimeType: string; content: Buffer }
  | { isFile: false; content: string };
type FormData = { [key: string]: FormElement };

const emitRabbitMQLog = async (cid: string) => {
  let connection;
  try {
    await new Response().arrayBuffer();
    connection = await amqp.connect(AMQP_URL);
    const channel = await connection.createChannel();

    await channel.assertExchange(AMQP_EXCHANGE, "fanout");
    channel.publish(AMQP_EXCHANGE, "", Buffer.from(cid));

    console.log(`Sent IPFS CID '${cid}' to exchange '${AMQP_EXCHANGE}'`);

    await channel.close();
  } catch (err) {
    console.warn(err);
    throw err;
  } finally {
    if (connection) await connection.close();
  }
};

const parseMultipart = ({ headers, body, isBase64Encoded }: HandlerEvent) =>
  new Promise<FormData>((resolve, reject) => {
    const fields: FormData = {};

    const bb = busboy({ headers });

    bb.on("file", (name, file, { filename, mimeType }) =>
      file.on("data", (content) => {
        fields[name] = { isFile: true, filename, mimeType, content };
      })
    )
      .on("field", (name, value) => {
        if (value) fields[name] = { isFile: false, content: value };
      })
      .on("close", () => resolve(fields))
      .on("error", (err) => reject(err));

    bb.write(body, isBase64Encoded ? "base64" : "binary");
    bb.end();
  });

const pinToFilebase = async (data: FormData) => {
  let uri = "";
  let fileCount = 0;
  let hasField = false;
  const parent: { [key: string]: string } = {};

  for (const [key, dataElement] of Object.entries(data)) {
    if (dataElement.isFile) {
      const { filename, mimeType, content } = dataElement;
      const cid = await filebase.storeDirectory([
        new File([content], filename, { type: mimeType }),
      ]);

      await emitRabbitMQLog(cid);

      uri = genUri(cid, filename);
      parent[key] = uri;
      fileCount++;
    }

    if (dataElement.isFile === false) {
      if (key !== PARENT_NAME_KEY) parent[key] = dataElement.content;
      hasField = true;
    }
  }

  if (hasField || fileCount > 1) {
    const name = (data[PARENT_NAME_KEY]?.content as string) || undefined;
    let cid = "";

    if (name)
      cid = await filebase.storeDirectory([
        new File([JSON.stringify(parent)], name, { type: PARENT_FILETYPE }),
      ]);
    else
      cid = await filebase.storeBlob(
        new Blob([JSON.stringify(parent)], { type: PARENT_FILETYPE })
      );

    await emitRabbitMQLog(cid);

    uri = genUri(cid, name);
  }

  return uri;
};

export const handler: Handler = async (event) => {
  if (!event.body)
    return {
      statusCode: StatusCodes.BAD_REQUEST,
      body: JSON.stringify({ message: "Invalid body format" }),
    };

  try {
    const parsed = await parseMultipart(event);

    const uri = await pinToFilebase(parsed);

    return {
      statusCode: StatusCodes.OK,
      body: JSON.stringify({ uri }),
    };
  } catch (err) {
    return {
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      body: JSON.stringify({ message: "Something went wrong" }),
    };
  }
};
