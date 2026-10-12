/**
 * What a customer is told when the shop moves their order to a new status.
 *
 * Plain data, no Deno or React Native APIs, so on-db-change imports it and the
 * app's jest suite tests it. English is the notification's own title/body; the
 * Arabic and Kurdish copies ride in `data` as titleAr/bodyAr/titleKu/bodyKu,
 * which is where send-push and the in-app list already look for them.
 *
 * null means "do not notify": `pending` is where every order starts, and a
 * customer who cancelled their own order does not need telling.
 */
export interface OrderStatusCopy {
  title: string;
  body: string;
  titleAr: string;
  bodyAr: string;
  titleKu: string;
  bodyKu: string;
}

export function orderStatusCopy(status: string | null | undefined, orderNumber?: string | null): OrderStatusCopy | null {
  const n = (orderNumber ?? '').toString().trim();
  // "your order #A123" when there is a number, "your order" when there is not.
  const en = n ? `Order ${n}` : 'Your order';
  const ar = n ? `طلبك ${n}` : 'طلبك';
  const ku = n ? `داواکاری ${n}` : 'داواکارییەکەت';

  switch (status) {
    case 'confirmed':
      return {
        title: 'Order confirmed',
        body: `${en} is confirmed. We'll let you know when it ships.`,
        titleAr: 'تم تأكيد طلبك',
        bodyAr: `تم تأكيد ${ar}. سنُعلمك عند شحنه.`,
        titleKu: 'داواکارییەکەت پشتڕاستکرایەوە',
        bodyKu: `${ku} پشتڕاستکرایەوە. کاتێک نێردرا ئاگادارت دەکەینەوە.`,
      };
    case 'processing':
      return {
        title: 'Preparing your order',
        body: `${en} is being prepared.`,
        titleAr: 'جارٍ تجهيز طلبك',
        bodyAr: `${ar} قيد التجهيز.`,
        titleKu: 'داواکارییەکەت ئامادە دەکرێت',
        bodyKu: `${ku} ئامادە دەکرێت.`,
      };
    case 'shipped':
      return {
        title: 'Your order is on its way',
        body: `${en} has been shipped.`,
        titleAr: 'طلبك في الطريق',
        bodyAr: `تم شحن ${ar}.`,
        titleKu: 'داواکارییەکەت لە ڕێگادایە',
        bodyKu: `${ku} نێردرا.`,
      };
    case 'delivered':
      return {
        title: 'Order delivered',
        body: `${en} has been delivered. Thank you for shopping with us!`,
        titleAr: 'تم تسليم طلبك',
        bodyAr: `تم تسليم ${ar}. شكراً لتسوقك معنا!`,
        titleKu: 'داواکارییەکەت گەیشت',
        bodyKu: `${ku} گەیەندرا. سوپاس بۆ بازاڕکردن لەگەڵمان!`,
      };
    case 'cancelled':
    case 'cancelled_by_store':
      return {
        title: 'Order cancelled',
        body: `${en} has been cancelled. Contact us if you have any questions.`,
        titleAr: 'تم إلغاء طلبك',
        bodyAr: `تم إلغاء ${ar}. تواصل معنا إذا كان لديك أي سؤال.`,
        titleKu: 'داواکارییەکەت هەڵوەشێنرایەوە',
        bodyKu: `${ku} هەڵوەشێنرایەوە. ئەگەر پرسیارێکت هەیە پەیوەندیمان پێوە بکە.`,
      };
    default:
      return null;
  }
}
