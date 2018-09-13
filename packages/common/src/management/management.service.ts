namespace Online {

  class ManagedPod {
    constructor(
      public pod,
      public jolokia: Jolokia.IJolokia,
    ) {
    }
  }

  export class ManagementService extends EventEmitter {

    private pods: { [key: string]: ManagedPod } = {};

    constructor(
      openShiftService: OpenShiftService,
      podStatusFilter: PodStatusFilter,
      $interval: ng.IIntervalService,
    ) {
      'ngInject';

      super();

      openShiftService.on('changed', _ => {
        const pods = openShiftService.getPods();
        openShiftService.getPods().forEach(pod => {
          if (!this.pods[pod.metadata.uid]) {
            // FIXME: read Jolokia port from container spec
            const port = 8778;
            const url = new URI().query('').path(`/master/api/v1/namespaces/${pod.metadata.namespace}/pods/https:${pod.metadata.name}:${port}/proxy/jolokia/`)
            this.pods[pod.metadata.uid] = new ManagedPod(pod, new Jolokia(url.valueOf()));
          } else {
            pod.management = this.pods[pod.metadata.uid].pod.management;
          }
          for (let uid in this.pods) {
            if (!pods.some(pod => pod.metadata.uid === uid)) {
              delete this.pods[uid];
            }
          }
        });
      });

      $interval(() => {
        let req = 0, res = 0;
        for (let uid in this.pods) {
          const mPod: ManagedPod = this.pods[uid];
          if (podStatusFilter(mPod.pod) === 'Running') {
            req++;
            mPod.jolokia.search('org.apache.camel:context=*,type=routes,*', {
              success: (routes:[]) => {
                res++;
                Core.pathSet(mPod.pod, 'management.camel.routes_count', routes.length);
                if (res === req) {
                  this.emit('updated');
                }
              },
              error: error => {
                // TODO
                res++;
                if (res === req) {
                  this.emit('updated');
              }
              },
           });
          }
        }
      }, 10000);
      // TODO: Use Jolokia polling preference
    }
  }
}