export type ResourcePool<Resource> = {
  acquire: () => Promise<Resource>;
  release: (resource: Resource) => void;
  close: () => Promise<void>;
};

export type ResourcePoolOptions<Resource> = {
  reuseResources?: boolean | undefined;
  closeResource?: ((resource: Resource) => void | Promise<void>) | undefined;
};

const create = <Resource>(
  getResource: () => Resource | Promise<Resource>,
  options?: ResourcePoolOptions<Resource>,
): ResourcePool<Resource> => {
  const cached: Resource[] = [];
  const allResources = new Set<Resource>();
  const reuse = options?.reuseResources ?? false;

  return {
    acquire: async () => {
      if (reuse) {
        const cachedOne = cached.pop();
        if (cachedOne !== undefined) return cachedOne;
      }
      const resource = await getResource();
      allResources.add(resource);
      return resource;
    },
    release: (resource) => {
      if (reuse) cached.push(resource);
    },
    close: async () => {
      const resources = [...allResources];
      allResources.clear();
      cached.length = 0;
      const closeResource = options?.closeResource;
      if (!closeResource) return;
      await Promise.all(
        resources.map((r) => Promise.resolve(closeResource(r))),
      );
    },
  };
};

export const ResourcePool = {
  create,
} as const;
