import userEvent from "@testing-library/user-event";

import {
  setupCollectionsEndpoints,
  setupDashboardCollectionItemsEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
  within,
} from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import SnippetCollections from "metabase/entities/snippet-collections";

import ItemPicker from "./ItemPicker";

function collection({
  id,
  name,
  location = "/",
  personal_owner_id = null,
  can_write = true,
}) {
  return {
    id,
    name,
    location,
    personal_owner_id,
    can_write,
    archived: false,
  };
}

function dashboard({ id, name, collection_id = null }) {
  return {
    id,
    name,
    collection_id,
    archived: false,
    model: "dashboard",
  };
}

const CURRENT_USER = createMockUser({
  id: 1,
  personal_collection_id: 100,
  is_superuser: true,
});

const COLLECTION = {
  ROOT: collection({ id: "root", name: "Our analytics", location: null }),
  PERSONAL: collection({
    id: CURRENT_USER.personal_collection_id,
    name: "My personal collection",
    personal_owner_id: CURRENT_USER.id,
  }),
  REGULAR: collection({ id: 1, name: "Regular collection" }),
  REGULAR_2: collection({ id: 6, name: "Regular collection 2" }),
  READ_ONLY: collection({
    id: 2,
    name: "Read only collection",
    can_write: false,
  }),
};

COLLECTION.REGULAR_CHILD = collection({
  id: 3,
  name: "Regular collection's child",
  location: `/${COLLECTION.REGULAR.id}/`,
});

const COLLECTION_READ_ONLY_CHILD_WRITABLE = collection({
  id: 4,
  name: "Read-only collection's child (writable)",
  location: `/${COLLECTION.READ_ONLY.id}/`,
});

const COLLECTION_OTHER_USERS = collection({
  id: 5,
  name: "John Lennon's personal collection",
  personal_owner_id: CURRENT_USER.id + 1,
});

const DASHBOARD = {
  REGULAR: dashboard({ id: 1, name: "Regular dashboard" }),
  REGULAR_CHILD: dashboard({
    id: 2,
    name: "Regular dashboard (nested)",
    collection_id: COLLECTION.REGULAR.id,
  }),
};

async function setup({
  models = ["dashboard"],
  collections = Object.values(COLLECTION),
  rootCollection = COLLECTION.ROOT,
  query,
  ...props
} = {}) {
  if (models.includes("dashboard")) {
    setupDashboardCollectionItemsEndpoint(Object.values(DASHBOARD));
  }

  setupCollectionsEndpoints({ collections, rootCollection });

  const onChange = jest.fn();

  renderWithProviders(
    <ItemPicker models={models} query={query} onChange={onChange} {...props} />,
    {
      storeInitialState: {
        currentUser: CURRENT_USER,
      },
    },
  );

  await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));

  return { onChange };
}

function getItemPickerHeader() {
  return screen.getByTestId("item-picker-header");
}

function getItemPickerList() {
  return screen.getByTestId("item-picker-list");
}

function queryListItem(itemName) {
  return within(getItemPickerList())
    .queryByText(itemName)
    .closest("[data-testid=item-picker-item]");
}

async function openCollection(itemName) {
  const collectionNode = within(queryListItem(itemName));
  userEvent.click(collectionNode.getByLabelText("chevronright icon"));
  await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
}

describe("ItemPicker", () => {
  it("displays items from the root collection by default", async () => {
    await setup();

    // Breadcrumbs
    expect(
      within(getItemPickerHeader()).getByText(/Our analytics/i),
    ).toBeInTheDocument();

    // Content
    expect(screen.getByText(DASHBOARD.REGULAR.name)).toBeInTheDocument();
    expect(screen.getByText(COLLECTION.REGULAR.name)).toBeInTheDocument();
    expect(screen.getByText(COLLECTION.REGULAR_2.name)).toBeInTheDocument();
    expect(screen.getByText(COLLECTION.PERSONAL.name)).toBeInTheDocument();
    expect(screen.queryAllByTestId("item-picker-item")).toHaveLength(4);
  });

  it("does not display read-only collections", async () => {
    await setup();
    expect(
      screen.queryByText(COLLECTION.READ_ONLY.name),
    ).not.toBeInTheDocument();
  });

  it("displays read-only collections if they have writable children", async () => {
    await setup({
      collections: [
        ...Object.values(COLLECTION),
        COLLECTION_READ_ONLY_CHILD_WRITABLE,
      ],
    });
    expect(screen.getByText(COLLECTION.READ_ONLY.name)).toBeInTheDocument();
  });

  it("can open nested collection", async () => {
    await setup();

    await openCollection(COLLECTION.REGULAR.name);

    const header = within(getItemPickerHeader());
    const list = within(getItemPickerList());

    // Breadcrumbs
    expect(header.getByText(/Our analytics/i)).toBeInTheDocument();
    expect(header.getByText(COLLECTION.REGULAR.name)).toBeInTheDocument();

    // Content
    expect(list.getByText(COLLECTION.REGULAR_CHILD.name)).toBeInTheDocument();
    expect(list.getByText(DASHBOARD.REGULAR_CHILD.name)).toBeInTheDocument();
    expect(list.getAllByTestId("item-picker-item")).toHaveLength(2);
  });

  it("can navigate back from a currently open nested collection", async () => {
    await setup();
    await openCollection(COLLECTION.REGULAR.name);
    let header = within(getItemPickerHeader());

    userEvent.click(header.getByText(/Our analytics/i));

    header = within(getItemPickerHeader());
    const list = within(getItemPickerList());

    expect(header.queryByText(COLLECTION.REGULAR.name)).not.toBeInTheDocument();

    expect(list.getByText(DASHBOARD.REGULAR.name)).toBeInTheDocument();
    expect(list.getByText(COLLECTION.REGULAR.name)).toBeInTheDocument();
    expect(list.getByText(COLLECTION.REGULAR_2.name)).toBeInTheDocument();
    expect(list.getByText(COLLECTION.PERSONAL.name)).toBeInTheDocument();
    expect(list.getAllByTestId("item-picker-item")).toHaveLength(4);
  });

  it("calls onChange when selecting an item", async () => {
    const { onChange } = await setup();

    userEvent.click(screen.getByText(DASHBOARD.REGULAR.name));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining(DASHBOARD.REGULAR),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("doesn't call onChange if it's not a collection picker", async () => {
    const { onChange } = await setup();
    userEvent.click(screen.getByText(COLLECTION.REGULAR.name));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("groups personal collections into single folder if there are more than one", async () => {
    await setup({
      collections: [...Object.values(COLLECTION), COLLECTION_OTHER_USERS],
    });

    userEvent.click(screen.getByText(/All personal collections/i));

    const list = within(getItemPickerList());
    expect(list.getByText(COLLECTION_OTHER_USERS.name)).toBeInTheDocument();
    expect(list.getByText(COLLECTION.PERSONAL.name)).toBeInTheDocument();
    expect(list.getAllByTestId("item-picker-item")).toHaveLength(2);
  });

  it("preselects value in the correspondent collection", async () => {
    await setup({
      initialOpenCollectionId: DASHBOARD.REGULAR_CHILD.collection_id,
      value: {
        model: "dashboard",
        id: DASHBOARD.REGULAR_CHILD.id,
      },
    });

    const header = within(getItemPickerHeader());

    // nested collection
    expect(header.getByText(COLLECTION.ROOT.name)).toBeInTheDocument();
    expect(header.getByText(COLLECTION.REGULAR.name)).toBeInTheDocument();

    const list = within(getItemPickerList());
    expect(list.getByText(DASHBOARD.REGULAR_CHILD.name)).toBeInTheDocument();
  });

  describe("preserves order of collections coming from API endpoint", () => {
    it("[personal, regular, regular 2]", async () => {
      const collections = [
        COLLECTION.PERSONAL,
        COLLECTION.REGULAR,
        COLLECTION.REGULAR_2,
      ];

      await setup({ collections });

      const items = screen.getAllByTestId("item-picker-item");

      expect(items.length).toBe(collections.length);
      expect(items[0]).toHaveTextContent(collections[0].name);
      expect(items[1]).toHaveTextContent(collections[1].name);
      expect(items[2]).toHaveTextContent(collections[2].name);
    });

    it("[personal, regular 2, regular]", async () => {
      const collections = [
        COLLECTION.PERSONAL,
        COLLECTION.REGULAR_2,
        COLLECTION.REGULAR,
      ];

      await setup({ collections });

      const items = screen.getAllByTestId("item-picker-item");

      expect(items.length).toBe(collections.length);
      expect(items[0]).toHaveTextContent(collections[0].name);
      expect(items[1]).toHaveTextContent(collections[1].name);
      expect(items[2]).toHaveTextContent(collections[2].name);
    });

    it("always shows personal collection first", async () => {
      const collections = [
        COLLECTION.REGULAR_2,
        COLLECTION.REGULAR,
        COLLECTION.PERSONAL,
      ];

      await setup({ collections });

      const items = screen.getAllByTestId("item-picker-item");

      expect(items.length).toBe(collections.length);
      expect(items[0]).toHaveTextContent(COLLECTION.PERSONAL.name);
      expect(items[1]).toHaveTextContent(COLLECTION.REGULAR_2.name);
      expect(items[2]).toHaveTextContent(COLLECTION.REGULAR.name);
    });
  });

  describe("preserves order of snippet collections coming from API endpoint", () => {
    it("[regular, regular 2]", async () => {
      const collections = [COLLECTION.REGULAR, COLLECTION.REGULAR_2];

      await setup({
        collections,
        entity: SnippetCollections,
        query: { namespace: "snippets" },
      });

      const items = screen.getAllByTestId("item-picker-item");

      expect(items.length).toBe(collections.length);
      expect(items[0]).toHaveTextContent(collections[0].name);
      expect(items[1]).toHaveTextContent(collections[1].name);
    });

    it("[regular 2, regular]", async () => {
      const collections = [COLLECTION.REGULAR_2, COLLECTION.REGULAR];

      await setup({
        collections,
        entity: SnippetCollections,
        query: { namespace: "snippets" },
      });

      const items = screen.getAllByTestId("item-picker-item");

      expect(items.length).toBe(collections.length);
      expect(items[0]).toHaveTextContent(collections[0].name);
      expect(items[1]).toHaveTextContent(collections[1].name);
    });
  });
});
