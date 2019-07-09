// Command line tool that reports on elasticsearch space usage by
// index pattern, and can delete old indices.
//
// Usage:
//     es-tool summary
//     es-tool delete --older-than-date YYYY-MM-DD
//     es-tool delete --older-than-months N

import AWS from 'aws-sdk';

interface StorageSize {
  docCount: number,
  sizeInBytes: number
};

type StringMap<T> = {[key:string]:T};
type StorageByIndex = StringMap<StorageSize>;

interface DateStorage {
  index: string,
  date: string,
  storage: StorageSize
};

interface StorageByIndexPattern {
  byDatedPattern: StringMap<
    { total: StorageSize,
    byDate: DateStorage[]
    }>,
  other: StorageByIndex;
};

async function queryStorageByIndex(client: Client): Promise<StorageByIndex> {
  // See: https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-stats.html
  const body = await client.httpGet("/_stats/store,docs");
  const indices = body['indices'];
  const result: StorageByIndex = {};
  for(const index of Object.keys(indices)) {
    result[index] = {
      docCount: indices[index].total.docs.count,
      sizeInBytes: indices[index].total.store.size_in_bytes,
    };
  }
  return result;
}

async function deleteIndex(client: Client, index: string): Promise<void> {
  // See: https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-delete-index.html
  await client.httpDelete("/" + index);
}

/**
 * Split the index name into a prefix pattern and a date, if it
 * is of the form: PREFIX-YYYY-MM-DD or PREFIX-YYYY.MM.DD
 */
function splitIndex(index: string) : {pattern: string, date:string} | undefined {
  {
    const re = /(.*)-(\d{4})-(\d{2})-(\d{2})/;
    const m = re.exec(index);
    if (m !== null) {
      return {
        pattern: m[1],
        date: m[2] + '-' + m[3] + '-' + m[4],
      };
    }
  }
  {
    const re = /(.*)-(\d{4})[.](\d{2})[.](\d{2})/;
    const m = re.exec(index);
    if (m !== null) {
      return {
        pattern: m[1],
        date: m[2] + '-' + m[3] + '-' + m[4],
      };
    }
  }
  return undefined;
}

/**
 * Categorize the storage by index pattern
 */
function groupByDatedPattern(storageByIndex: StorageByIndex): StorageByIndexPattern {
  const result: StorageByIndexPattern = {
    byDatedPattern: {},
    other: {}
  };

  for (const index of Object.keys(storageByIndex)) {
    const storage = storageByIndex[index];
    const datedIndex = splitIndex(index);
    if (datedIndex == undefined) {
      result.other[index] = storage;
    } else {
      if (result.byDatedPattern[datedIndex.pattern] == undefined) {
        result.byDatedPattern[datedIndex.pattern] = {
          total: {docCount: 0, sizeInBytes: 0},
          byDate: [],
        };
      }
      const rv = result.byDatedPattern[datedIndex.pattern];
      rv.total.docCount += storage.docCount;
      rv.total.sizeInBytes += storage.sizeInBytes;
      rv.byDate.push({index, date:datedIndex.date, storage});
    }
  }
  for (const index of Object.keys(result.byDatedPattern)) {
    result.byDatedPattern[index].byDate.sort((v1,v2) => v1.date < v2.date ? -1 : v1.date > v2.date ? 1 : 0);
  }
  return result;
}

function lpad(s: string, width: number): string {
  return ' '.repeat(Math.max(0,width - s.length)) + s;
}

function rpad(s: string, width: number): string {
  return s  + ' '.repeat(Math.max(0,width - s.length));
}

async function printSummary(client: Client) {
  const storage = await queryStorageByIndex(client);
  const groupedStorage = groupByDatedPattern(storage);
  
  console.log("IndexPattern         MinDate        MaxDate            NumDocs     SizeInBytes");
  console.log("------------------------------------------------------------------------------");
  for (const pattern of Object.keys(groupedStorage.byDatedPattern)) {
    const s = groupedStorage.byDatedPattern[pattern];
    const mindate = s.byDate[0].date;
    const maxdate = s.byDate[s.byDate.length-1].date;
    console.log(`${rpad(pattern,20)} ${mindate}     ${maxdate} ${lpad('' + s.total.docCount,15)} ${lpad('' + s.total.sizeInBytes,15)}`);
  }
  console.log();

  console.log("Index                        NumDocs     SizeInBytes");
  console.log("----------------------------------------------------");
  for (const index of Object.keys(groupedStorage.other)) {
    const s = groupedStorage.other[index];
    console.log(`${rpad(index,20)} ${lpad('' + s.docCount,15)} ${lpad('' + s.sizeInBytes,15)}`);
  }
}

async function deleteOlderThanDate(client: Client, keepFrom: string, dryRun: boolean) {
  const storage = await queryStorageByIndex(client);
  const groupedStorage = groupByDatedPattern(storage);
  for (const pattern of Object.keys(groupedStorage.byDatedPattern)) {
    for(const ds of groupedStorage.byDatedPattern[pattern].byDate) {
      if( ds.date < keepFrom) {
        console.log('deleting', ds.index)
        if (!dryRun) {
          try {
             await deleteIndex(client, ds.index);
          } catch (e) {
            console.log("...failed", e);
          }
        }
      }
    }
  }
}

async function deleteOlderThanMonths(client: AwsClient, months: number, dryRun: boolean) {
    const date = new Date();
    date.setMonth(date.getMonth() - months);
    const dateStr = date.toISOString().substring(0,10);
    await deleteOlderThanDate(client, dateStr, false);
}


function isIsoDate(s: string) : boolean {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const m = re.exec(s);
  return  m !== null;
}

function isNumber(s: string): boolean {
  const re = /^\d+$/;
  const m = re.exec(s);
  return  m !== null;
}

interface Client {
  httpGet(path: string): Promise<{}>;
  httpDelete(path: string): Promise<void>;
}

class AwsClient implements Client {

  private credentials: AWS.EnvironmentCredentials;
  private endpoint: AWS.Endpoint;

  constructor(readonly region: string, readonly baseUrl: string) {
   this.credentials = new AWS.EnvironmentCredentials('AWS');
   this.endpoint = new AWS.Endpoint(baseUrl);
  }

  async httpGet(path: string): Promise<{}> {
    const request = new AWS.HttpRequest(this.endpoint, this.region);
    request.method = 'GET';
    request.path = path;
    request.headers['host'] = this.baseUrl;
    request.headers['Content-Type'] = 'application/json';
    const body = await this.fetch(request);
    return JSON.parse(body);
  };

  async httpDelete(path: string): Promise<void> {
    const request = new AWS.HttpRequest(this.endpoint, this.region);
    request.method = 'DELETE';
    request.path = path;
    request.headers['host'] = this.baseUrl;
    await this.fetch(request);
  }

  private fetch(request: AWS.HttpRequest): Promise<string> {
    const signer = new (AWS as any).Signers.V4(request, 'es');
    signer.addAuthorization(this.credentials, new Date());
    const client = new (AWS as any).HttpClient();
    return new Promise( (resolve,reject) => {
      client.handleRequest(request, null, function(response: any) {
       var responseBody = '';
       response.on('data', function (chunk: any) {
         responseBody += chunk;
       });
       response.on('end', function (_chunk: any) {
         resolve(responseBody);
       });
     }, function(error: any) {
       reject(error);
     });
    });
  }
}

function usage() {
  console.log('Usage:');
  console.log('    es-tool summary');
  console.log('    es-tool delete --older-than-date YYYY-MM-DD');
  console.log('    es-tool delete --older-than-months N');
  console.log()
  console.log('needs ES_ENDPOINT to be set to the elasticsearch endpoint')
  console.log('needs AWS_DEFAULT_REGION, AWS_ACCESS_KEY, AWS_SECRET_ACCESS_KEY to be set')
  console.log()
}

async function main(argv: string[]) {
  const baseUrl = process.env['ES_ENDPOINT'];
  if (baseUrl === undefined) {
    usage();
    throw new Error('ES_ENDPOINT environment variable is not defined');
  }

  const region = process.env['AWS_DEFAULT_REGION'];
  if (region === undefined) {
    usage();
    throw new Error('AWS_DEFAULT_REGION environment variable is not defined');
  }

  const client = new AwsClient(region, baseUrl);

  if (argv.length === 3 && argv[2] === 'summary') {
    await printSummary(client);
  } else if (argv.length === 5 && argv[2] === 'delete' && argv[3] === '--older-than-date' && isIsoDate(argv[4])) {
    const dateStr = argv[4];
    await deleteOlderThanDate(client, dateStr, false);
  } else if (argv.length === 5 && argv[2] === 'delete' && argv[3] === '--older-than-months' && isNumber(argv[4])) {
    await deleteOlderThanMonths(client, parseInt(argv[4]), false);
  } else {
    usage();
  }
};

interface CloudWatchEventInput {
  months: number
};

export async function cronDelete(event: CloudWatchEventInput) {
  const baseUrl = process.env['ES_ENDPOINT'];
  if (baseUrl === undefined) {
    throw new Error('ES_ENDPOINT environment variable is not defined');
  }
  const region = process.env['AWS_DEFAULT_REGION'];
  if (region === undefined) {
    throw new Error('AWS_DEFAULT_REGION environment variable is not defined');
  }
  const client = new AwsClient(region, baseUrl);

  await deleteOlderThanMonths(client, event.months, false);
}

main(process.argv).catch(console.log)
