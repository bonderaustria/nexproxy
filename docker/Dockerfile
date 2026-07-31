# This is a Dockerfile intended to be built using `docker buildx`
# for multi-arch support. Building with `docker build` may have unexpected results.

# This file assumes that the frontend has been built using ./scripts/frontend-build

ARG BASE_IMAGE=nginxproxymanager/nginx-full:certbot-node
FROM $BASE_IMAGE

ARG TARGETPLATFORM
ARG BUILD_VERSION
ARG BUILD_COMMIT
ARG BUILD_DATE

# See: https://github.com/just-containers/s6-overlay/blob/master/README.md
ENV SUPPRESS_NO_CONFIG_WARNING=1 \
	S6_BEHAVIOUR_IF_STAGE2_FAILS=1 \
	S6_CMD_WAIT_FOR_SERVICES_MAXTIME=0 \
	S6_FIX_ATTRS_HIDDEN=1 \
	S6_KILL_FINISH_MAXTIME=10000 \
	S6_VERBOSITY=1 \
	NODE_ENV=production \
	NPM_BUILD_VERSION="${BUILD_VERSION}" \
	NPM_BUILD_COMMIT="${BUILD_COMMIT}" \
	NPM_BUILD_DATE="${BUILD_DATE}" \
	NODE_OPTIONS="--openssl-legacy-provider"

RUN echo "fs.file-max = 65535" > /etc/sysctl.conf \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends jq logrotate \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/*

# s6 overlay (tarballs bundled to avoid depending on GitHub during the build)
COPY docker/scripts/install-s6 /tmp/install-s6
COPY docker/s6-cache /tmp/s6-cache
RUN /tmp/install-s6 "${TARGETPLATFORM}" && rm -f /tmp/install-s6 && rm -rf /tmp/s6-cache

EXPOSE 80 81 443

COPY backend       /app
COPY frontend/dist /app/frontend
COPY docker/rootfs /

WORKDIR /app
RUN yarn install \
	&& yarn cache clean

# Remove frontend service not required for prod, dev nginx config as well
RUN rm -rf /etc/s6-overlay/s6-rc.d/user/contents.d/frontend /etc/nginx/conf.d/dev.conf \
	&& chmod 644 /etc/logrotate.d/nexproxy

VOLUME [ "/data" ]
ENTRYPOINT [ "/init" ]

LABEL org.opencontainers.image.title="NexProxy" \
	org.opencontainers.image.description="Self-hosted reverse-proxy manager with high availability and multi-tenancy" \
	org.opencontainers.image.licenses="MIT" \
	org.opencontainers.image.source="https://github.com/bonderaustria/nexproxy" \
	org.opencontainers.image.url="https://github.com/bonderaustria/nexproxy"
