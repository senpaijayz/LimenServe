import { Link } from "react-router";
import { buildLocator3DUrl } from "../../locator3d/utils/locatorNavigation";

export default function ReceivedStockHandoff({ receipt }) {
  return (
    <section className="space-y-3 rounded-xl border border-primary-200 bg-white p-4">
      <h2 className="text-lg font-bold text-primary-950">
        Put received parts away
      </h2>
      <p className="text-sm text-primary-700">
        Open each part in the warehouse locator, check its saved shelf and bin,
        then place the stock there. A warehouse assignment does not confirm that
        physical put-away is complete.
      </p>
      <ul className="divide-y divide-primary-100">
        {(receipt.items || []).map((item, index) => {
          const id = item.productId || item.id;
          return (
            <li
              key={id || index}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <div className="min-w-0">
                <strong className="break-all font-mono text-primary-950">
                  {item.partNumber || item.sku || id}
                </strong>
                <p className="break-words text-primary-800">
                  {item.description || item.name}
                </p>
                <p className="text-primary-700">Received: {item.quantity}</p>
              </div>
              {id && (
                <Link
                  to={`${buildLocator3DUrl({ id, sku: item.partNumber || item.sku, name: item.description || item.name })}&received=1`}
                  className="inline-flex min-h-11 items-center rounded-lg border border-blue-300 px-3 font-semibold text-blue-800"
                >
                  Locate / assign
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Link className="btn border border-primary-300" to="/inventory/logs">
          View movement history
        </Link>
        <Link
          className="btn border border-primary-300"
          to="/inventory"
        >
          Back to inventory
        </Link>
      </div>
    </section>
  );
}
