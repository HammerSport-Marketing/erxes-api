import { ConversationMessages, Conversations, Customers, Integrations, Segments, Users } from '../../../db/models';
import { METHODS } from '../../../db/models/definitions/constants';
import { ICustomerDocument } from '../../../db/models/definitions/customers';
import { IEngageMessage } from '../../../db/models/definitions/engages';
import { IUserDocument } from '../../../db/models/definitions/users';
import { INTEGRATION_KIND_CHOICES, MESSAGE_KINDS } from '../../constants';
import QueryBuilder from '../../modules/segments/queryBuilder';

/**
 * Dynamic content tags
 */
export const replaceKeys = ({
  content,
  customer,
  user,
}: {
  content: string;
  customer: ICustomerDocument;
  user: IUserDocument;
}): string => {
  let result = content;

  let customerName = customer.firstName || customer.lastName || 'Customer';

  if (customer.firstName && customer.lastName) {
    customerName = `${customer.firstName} ${customer.lastName}`;
  }

  const details = user.details ? user.details.toJSON() : {};

  // replace customer fields
  result = result.replace(/{{\s?customer.name\s?}}/gi, customerName);
  result = result.replace(/{{\s?customer.email\s?}}/gi, customer.primaryEmail || '');

  // replace user fields
  result = result.replace(/{{\s?user.fullName\s?}}/gi, details.fullName || '');
  result = result.replace(/{{\s?user.position\s?}}/gi, details.position || '');
  result = result.replace(/{{\s?user.email\s?}}/gi, user.email || '');

  return result;
};

/**
 * Find customers
 */
export const findCustomers = async ({
  customerIds,
  segmentIds = [],
  tagIds = [],
  brandIds = [],
}: {
  customerIds?: string[];
  segmentIds?: string[];
  tagIds?: string[];
  brandIds?: string[];
}): Promise<ICustomerDocument[]> => {
  // find matched customers
  let customerQuery: any = { _id: { $in: customerIds || [] } };
  const doNotDisturbQuery = [{ doNotDisturb: 'No' }, { doNotDisturb: { $exists: false } }];

  if (tagIds.length > 0) {
    customerQuery = { $or: doNotDisturbQuery, tagIds: { $in: tagIds || [] } };
  }

  if (brandIds.length > 0) {
    const integrationIds = await Integrations.find({ brandId: { $in: brandIds } }).distinct('_id');

    customerQuery = { $or: doNotDisturbQuery, integrationId: { $in: integrationIds } };
  }

  if (segmentIds.length > 0) {
    const segmentQueries: any = [];

    const segments = await Segments.find({ _id: { $in: segmentIds } });

    for (const segment of segments) {
      const filter = await QueryBuilder.segments(segment);

      filter.$or = doNotDisturbQuery;

      segmentQueries.push(filter);
    }

    customerQuery = { $or: segmentQueries };
  }

  return Customers.find(customerQuery);
};

export const send = async (engageMessage: IEngageMessage, engagesApi?: any) => {
  const { customerIds, segmentIds, tagIds, brandIds, fromUserId } = engageMessage;

  const user = await Users.findOne({ _id: fromUserId });

  if (!user) {
    throw new Error('User not found');
  }

  if (!engageMessage.isLive) {
    return;
  }

  const customers = await findCustomers({ customerIds, segmentIds, tagIds, brandIds });

  // save matched customer ids
  // EngageMessages.setCustomerIds(engageMessage._id, customers);

  if (engageMessage.method === METHODS.EMAIL) {
    const customerInfos = customers.map(customer => {
      let customerName = customer.firstName || customer.lastName || 'Customer';

      if (customer.firstName && customer.lastName) {
        customerName = `${customer.firstName} ${customer.lastName}`;
      }

      return {
        _id: customer._id,
        name: customerName,
        email: customer.primaryEmail,
      };
    });

    return engagesApi.send({
      customers: customerInfos,
      engageMessage,
      user: {
        email: user.email,
        name: user.details && user.details.fullName,
        position: user.details && user.details.position,
      },
    });
  }

  if (engageMessage.method === METHODS.MESSENGER && engageMessage.kind !== MESSAGE_KINDS.VISITOR_AUTO) {
    return sendViaMessenger(engageMessage, customers, user, engagesApi);
  }
};

/**
 * Send via messenger
 */
export const sendViaMessenger = async (
  message: IEngageMessage,
  customers: ICustomerDocument[],
  user: IUserDocument,
  engagesApi,
) => {
  const { fromUserId } = message;

  if (!message.messenger) {
    return;
  }

  const { brandId, content = '' } = message.messenger;

  // find integration
  const integration = await Integrations.findOne({
    brandId,
    kind: INTEGRATION_KIND_CHOICES.MESSENGER,
  });

  if (integration === null) {
    throw new Error('Integration not found');
  }

  const engageMessage = await engagesApi.send({
    engageMessage: message,
    customerIds: customers.map(customer => customer._id),
  });

  for (const customer of customers) {
    // replace keys in content
    const replacedContent = replaceKeys({ content, customer, user });
    // create conversation
    const conversation = await Conversations.createConversation({
      userId: fromUserId,
      customerId: customer._id,
      integrationId: integration._id,
      content: replacedContent,
    });

    // create message
    await ConversationMessages.createMessage({
      engageData: {
        messageId: engageMessage._id,
        fromUserId,
        ...engageMessage.messenger.toJSON(),
      },
      conversationId: conversation._id,
      userId: fromUserId,
      customerId: customer._id,
      content: replacedContent,
    });
  }

  return engageMessage;
};

/*
 * Handle engage unsubscribe request
 */
export const handleEngageUnSubscribe = (query: { cid: string }) =>
  Customers.updateOne({ _id: query.cid }, { $set: { doNotDisturb: 'Yes' } });
