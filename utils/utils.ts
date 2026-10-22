import { REGEX, DEFAULT_APPLICATION_PORT, APP_NAME, TIME_SETTINGS, DAYS, DEFAULT_PAYLOAD_FIELDS_SIZE } from './constants';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from './helpers/logger';
import * as dotenv from 'dotenv';
import moment from 'moment';
import EmailService from '../integration/emailService';
import { IAppConfig } from '../core/interfaces/appConfig';
import { IApiResponseOptions, IEmailAttachment } from '../core/interfaces/generalInterface';
import UserRoles from '../core/enums/userRoles';

export abstract class Utils {

  public static async Sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  }

  public static UUIDGenerator() {
    return uuidv4();
  }

  public static generateRandomEmail() {
    const uuid = this.UUIDGenerator();
    return `${uuid}@${APP_NAME}.com`;
  }


  public static generateRandomPassword(passwordLength: number = DEFAULT_PAYLOAD_FIELDS_SIZE.MIN_PASSWORD_LENGTH) {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    const specialChars = '@$!%*?&';
    const allChars = lowercase + uppercase + digits + specialChars;

    if (passwordLength < 8 || passwordLength > 20) {
      throw new Error('Password length must be between 8 and 20 characters.');
    }

    const getRandom = str => str[Math.floor(Math.random() * str.length)];
    const requiredChars = [
      getRandom(lowercase),
      getRandom(uppercase),
      getRandom(digits),
      getRandom(specialChars),
    ];

    for (let i = requiredChars.length; i < passwordLength; i++) {
      requiredChars.push(getRandom(allChars));
    }

    const shuffled = requiredChars.sort(() => Math.random() - 0.5).join('');
    return shuffled;
  }

  public static generateRandomCode(length: number = 8): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';

    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      code += characters[randomIndex];
    }

    return code;
  }

  public static async LoadEnv(): Promise<IAppConfig> {
    try {

      if (global.environment === 'local') {
        dotenv.config();
      }

      const config: IAppConfig = {
        PORT: parseInt(process.env.PORT, 10) || DEFAULT_APPLICATION_PORT,
        ENV: process.env.ENV || 'local',
        DB: {
          mongodb: {
            configuration: {
              dbname: process.env.MONGO_DB_NAME,
              host: process.env.MONGO_DB_HOST,
              port: parseInt(process.env.MONGO_DB_PORT),
              atlas: process.env.MONGO_DB_ATLAS === 'true',
              auth: {
                username: process.env.MONGO_DB_USERNAME,
                password: process.env.MONGO_DB_PASSWORD,
              },
              protocol: process.env.MONGO_DB_PROTOCOL
            }
          }
        },
        URLS: {
          frontendBaseUrl: process.env.FRONTEND_BASE_URL,
          appUrl: process.env.APP_URL,
          supportEmail: process.env.SUPPORT_EMAIL,
        },
        ENCRYPTION: {
          jwt: {
            api: {
              passphrase: process?.env?.API_JWT_PASSPHRASE || '',
              privateKey:
                process?.env?.API_JWT_PRIVATE_KEY
                  ? Buffer.from(process.env.API_JWT_PRIVATE_KEY, 'base64').toString('utf8')
                  : '',
              publicKey:
                process?.env?.API_JWT_PUBLIC_KEY
                  ? Buffer.from(process.env.API_JWT_PUBLIC_KEY, 'base64').toString('utf8')
                  : '',
            },
          },
          aesEncryption: {
            gmc: {
              key: process.env.AES_ENCRYPTION_SALT,
              iv: process.env.AES_ENCRYPTION_IV
            }
          }
        },
        SERVICES: {
          redis: {
            url: process.env.REDIS_URL
          },
          email: {
            nodeMailer: {
              auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
              },
              host: process.env.EMAIL_HOST,
              port: parseInt(process.env.EMAIL_PORT),
              secure: process.env.EMAIL_SECURE_CONNECTION?.toLowerCase() === 'true',
              service: process.env.EMAIL_SERVICE || ""
            }
          },
          llm: {
            aiModelProvider: process.env.AI_MODEL_PROVIDER,
            ...(process.env.AI_MODEL_PROVIDER === 'azure' ?
              {
                azureGPT: {
                  endpoint: process.env.AI_MODEL_API_ENDPOINT,
                  deploymentName: process.env.AI_MODEL_DEPLOYMENT_NAME,
                  qaDeploymentName: process.env.AI_QA_MODEL_DEPLOYMENT_NAME,
                  apiVersion: process.env.AI_MODEL_API_VERSION,
                  apiKey: process.env.AI_MODEL_API_KEY
                }
              } :
              {
                openAIGPT: {
                  deploymentName: process.env.AI_MODEL_DEPLOYMENT_NAME,
                  apiKey: process.env.AI_MODEL_API_KEY
                }
              })
          },
          AZURE: {
            MEDIA_STORAGE_SERVICE: {
              STORAGE_CONNECTION_STRING: process.env.AZURE_BLOB_STORAGE_CONNECTION_STRING,
              IMAGES_CONTAINER_NAME: process.env.AZURE_BLOB_STORAGE_REPORTS_CONTAINER_NAME,
            },
            DOCUMENT_INTELLIGENCE_SERVICE: {
              endpoint: process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
              apiKey: process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY
            },
            AI_SEARCH_SERVICE: {
              endpoint: process.env.AZURE_AI_SEARCH_ENDPOINT,
              apiKey: process.env.AZURE_AI_SEARCH_API_KEY,
              apiVersion: process.env.AZURE_AI_SEARCH_API_VERSION || '2024-07-01',
              codesIndexName:
                process.env.AZURE_AI_SEARCH_WORKLIGHTER_COMCODE_COSCODE_KB_INDEX_NAME ||
                process.env.AZURE_AI_SEARCH_USER_KB_INDEX_NAME,
              jobsIndexName: process.env.AZURE_AI_SEARCH_JOBS_INDEX_NAME || 'worklighter-jobs',
              dimensionAwareIndex: (process.env.AZURE_AI_SEARCH_DIMENSION_AWARE_INDEX || 'true').toLowerCase() !== 'false',
            },
            OPENAI_EMBEDDINGS: {
              endpoint: process.env.AZURE_OPENAI_EMBEDDING_ENDPOINT,
              deployment: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
              apiVersion: process.env.AZURE_OPENAI_EMBEDDING_API_VERSION || '2024-10-21',
              apiKey: process.env.AZURE_OPENAI_EMBEDDING_API_KEY,
              dimensions: parseInt(process.env.AZURE_OPENAI_EMBEDDING_DIMENSIONS || '3072', 10),
            },
          },
          MAILGUN: {
            signingKey: process.env.MAILGUN_SIGNING_KEY
          },
          stripe: {
            publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
            secretKey: process.env.STRIPE_SECRET_KEY || '',
            webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
          },
        },

        CLIENT_URL: process.env.CLIENT_URL
      };

      return config;

    } catch (error) {
      Logger.Log(
        'Error occurred while configuring the env properties',
        'error'
      );
      throw new Error(error);
    }
  }

  public static CalcPagination(currentpage: number, perPage: number) {
    let skip = perPage * (currentpage - 1);
    return { skip: skip, limit: perPage };
  }

  public static pagination(
    lastPage: boolean,
    data: object[] = [],
    continuationToken: string | null = null,
    total?: number
  ) {
    return {
      searchResult: data,
      pagination: {
        lastPage,
        firstPage: 1,
        count: data?.length > 0 ? data.length : 0,
        continuationToken,
        total
      },
    };
  }

  public static isTimeInRange(
    startTime: string,
    endTime: string,
    rangeStart: string,
    rangeEnd: string
  ): boolean {
    const startTimeInDate = new Date(`2000-01-01T${startTime}`);
    const endTimeInDate = new Date(`2000-01-01T${endTime}`);
    const rangeStartTime = new Date(`2000-01-01T${rangeStart}`);
    const rangeEndTime = new Date(`2000-01-01T${rangeEnd}`);
    return startTimeInDate >= rangeStartTime && endTimeInDate <= rangeEndTime;
  }

  public static selectFieldsFromObject(data: any, fields: any) {
    return fields.reduce(
      (acc: { [x: string]: any }, field: string | number) => {
        if (data.hasOwnProperty(field)) {
          acc[field] = data[field];
        }
        return acc;
      },
      {}
    );
  }

  public static selectFieldsFromArrayOfObjects(
    data: any[],
    fields: string[]
  ): any[] {
    return data.map((obj: Record<string, any>) => {
      const selectedFields: Record<string, any> = {};
      fields.forEach((field) => {
        if (field in obj) {
          selectedFields[field] = obj[field];
        }
      });
      return selectedFields;
    });
  }

  public static getFieldsFromObject(data: {}, fields: string[]) {
    const returnData = fields.map((field) => {
      return data[field];
    });

    return returnData;
  }

  public static getCurrentDate(utcOffset?: number): string {
    const currentDate: Date = new Date();
    if (utcOffset) {
      const offsetDate = new Date(currentDate.getTime() + utcOffset * 60 * 1000);
      return offsetDate.toISOString();
    }
    return currentDate.toISOString();
  }

  public static getCurrentDateFormatted(offsetInHours = 0) {
    const currentTimeUTC = moment().utc();
    const adjustedDate = currentTimeUTC.add(offsetInHours, 'hours');
    return adjustedDate.format('YYYY-MM-DD');
  }

  public static getCurrentTimeIn24HourFormat(offsetInHours: number) {
    const currentTimeUTC = moment().utc();
    const adjustedTime = currentTimeUTC.add(offsetInHours, 'hours');
    return adjustedTime.format('HH:mm:ss');
  }

  public static getFutureYear(yearOffset: number) {
    const oneYearFromNow = new Date();
    return oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + yearOffset);
  }

  public static getDayFromDate(targetDate: string) {
    return new Date(targetDate).getDay();
  }

  public static standardTimeFormatter(time: string) {
    const [hourStr, minuteStr] = time.split(':');
    let hour = parseInt(hourStr, 10);
    const minutes = parseInt(minuteStr, 10);
    const ampm = hour >= TIME_SETTINGS.MIDNIGHT ? 'PM' : 'AM';
    hour = hour % TIME_SETTINGS.MIDNIGHT;
    hour = hour || TIME_SETTINGS.MIDNIGHT;
    const minutesStr = minutes < TIME_SETTINGS.STRIP_LIMIT ? '0' + minutes : minutes;
    return `${hour}:${minutesStr} ${ampm}`;
  }

  public static generateVerboseDateTime(date: string | number | Date, startTime: string, endTime: string) {
    date = new Date(date);
    const numberOfDay = this.getDayFromDate(`${date}`);
    const numericalDay = date.getDate();
    const month = date.toLocaleString('default', { month: 'short' });
    startTime = this.standardTimeFormatter(startTime);
    endTime = this.standardTimeFormatter(endTime);
    return `${DAYS[numberOfDay]}, ${numericalDay} ${month} - ${startTime} - ${endTime}`;
  }

  public static capitalizeFirstLetter(word: string): string {
    return word.replace(
      /\b\w+\b/g,
      (match) => match.charAt(0).toUpperCase() + match.slice(1).toLowerCase()
    );
  }

  public static getValueOfUnAssignedData(column: any) {
    let returnValue: any;

    switch (column.columnDataType) {
      case 'boolean':
        returnValue = true;
        break;
      case 'array':
        returnValue = [];
        break;
      case 'string':
        returnValue = null;
        break;
      case 'object':
        returnValue = null;
        break;
      case 'date':
        returnValue = this.getCurrentDate();
        break;
      case 'number':
        returnValue = 0;
        break;
      default:
        returnValue = true;
    }

    return returnValue;
  }

  public static apiResponse(options: IApiResponseOptions) {
    const {
      res,
      code,
      status,
      responseCode,
      responseDescription,
      data = {},
    } = options;
    const cleanedDescription = this.cleanDescription(responseDescription);
    return res.status(code).send({
      status,
      responseCode,
      responseDescription: cleanedDescription,
      data: data || {},
    });
  }

  private static cleanDescription(description: string) {
    return description.replace(REGEX.STRIP_ESCAPE_QUOTATION_MARKS_REGEX, '');
  }

  public static generateSlug(text: string) {
    const trimmedText = text.trim().replace(/\s+/g, ' ');
    const textWithoutCommas = trimmedText.replace(/,/g, '');
    const slug = textWithoutCommas.split(' ').join('_').toLowerCase();
    return slug;
  }

  public static checkAllFieldsFilledInObject(data: Record<string, any>) {
    return !Object.values(data).some(value => !value);
  }

  public static placeHoldersReplacer(targetText: string, placeHolders: string[], values: string[]) {
    for (let i = 0; i < placeHolders.length; i++) {
      const placeholder = placeHolders[i];
      const value = values[i];

      const regex = new RegExp(placeholder, 'g');
      targetText = targetText.replace(regex, value);
    }

    return targetText;
  }

  public static detectShopifyOrderId = (text: string): string | null => {
    const orderIdPattern = /#\d{3,10}|\bgid:\/\/shopify\/Order\/\d+|\bOrder\s+\d{3,10}\b/g;
    const matches = text.match(orderIdPattern);
    return matches ? matches[0] : null;
  };


  public static async sendMail(recepient: string, templateSlug: string, placeholders: Record<string, any>, subject: string = null, attachments: IEmailAttachment[] = []) {
    const emailService = EmailService.getInstance();
    await emailService.sendMail(recepient, templateSlug, placeholders, subject, attachments);
  }


  public static getTimeDifferenceInDays(date1: any, date2: any) {
    date1 = new Date(date1);
    date2 = new Date(date2);
    const timeDiff = Math.abs(date2.getTime() - date1.getTime());
    const diffDays = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    return diffDays;
  }


  public static extractCustomerReply(payload: any): string {
    let body = '';

    // Extract plain text body
    if (payload.body?.data) {
      body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } else if (payload.parts) {
      const part = payload.parts.find(p => p.mimeType === 'text/plain');
      if (part?.body?.data) {
        body = Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }

    const quotedReplyRegex = /^On\s.+\s<.+@.+>\swrote:$/m;
    const lines = body.split('\n');
    const customerReplyLines = [];

    for (const line of lines) {
      if (quotedReplyRegex.test(line.trim())) {
        break;
      }
      customerReplyLines.push(line);
    }

    return customerReplyLines.join('\n').trim();
  }


  public static formatElapsedHours(hours: number): string {
    const units = [
      { name: 'year', hoursInUnit: 24 * 365 },
      { name: 'month', hoursInUnit: 24 * 30 },
      { name: 'week', hoursInUnit: 24 * 7 },
      { name: 'day', hoursInUnit: 24 },
      { name: 'hour', hoursInUnit: 1 },
    ];

    for (const { name, hoursInUnit } of units) {
      if (hours >= hoursInUnit) {
        const value = Math.round(hours / hoursInUnit);
        return `${value} ${name}${value !== 1 ? 's' : ''}`;
      }
    }

    return '0 hours';
  }


  public static checkUserRole(role: string) {
    if (role === UserRoles.SUPERADMIN || role === UserRoles.PLATFORMADMIN) return true;
    return false;
  }
  public static convertSizeToMB(size: number) {
    return size / (1024 * 1024);
  }

}
