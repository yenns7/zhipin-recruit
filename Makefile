.PHONY: build push clean all frontend server buildfrontend pushfrontend cleanfrontend buildserver pushserver cleanserver

# Environment variables that can be overridden by GitLab CI
PKG_TAG ?= RC
PKG_VERSION ?= $(shell date +%Y%m%d%H%M)

# Determine registry based on PKG_TAG
ifeq ($(PKG_TAG),GA)
	REGISTRY = registry.ymdd.tech
else
	REGISTRY = registry-sit.uce.cn
endif

ZHIPIN_FRONTEND_REPO = system-zhipin-mvp/zhipin-frontend
ZHIPIN_SERVER_REPO = system-zhipin-mvp/zhipin-server

ZHIPIN_FRONTEND_IMAGE = $(REGISTRY)/$(ZHIPIN_FRONTEND_REPO):$(PKG_VERSION)
ZHIPIN_SERVER_IMAGE = $(REGISTRY)/$(ZHIPIN_SERVER_REPO):$(PKG_VERSION)

all: build push clean
frontend: buildfrontend pushfrontend cleanfrontend
server: buildserver pushserver cleanserver

build: buildfrontend buildserver

push: pushfrontend pushserver

clean: cleanfrontend cleanserver

buildfrontend:
	@echo "Building zhipin-frontend image: $(ZHIPIN_FRONTEND_IMAGE)"
	sudo docker build -t $(ZHIPIN_FRONTEND_IMAGE) -f frontend/Dockerfile .

pushfrontend:
	@echo "Pushing zhipin-frontend image: $(ZHIPIN_FRONTEND_IMAGE)"
	sudo docker push $(ZHIPIN_FRONTEND_IMAGE)

cleanfrontend:
	@echo "Cleaning up local zhipin-frontend image"
	-sudo docker rmi $(ZHIPIN_FRONTEND_IMAGE)

buildserver:
	@echo "Building zhipin-server image: $(ZHIPIN_SERVER_IMAGE)"
	sudo docker build -t $(ZHIPIN_SERVER_IMAGE) -f backend/Dockerfile .

pushserver:
	@echo "Pushing zhipin-server image: $(ZHIPIN_SERVER_IMAGE)"
	sudo docker push $(ZHIPIN_SERVER_IMAGE)

cleanserver:
	@echo "Cleaning up local zhipin-server image"
	-sudo docker rmi $(ZHIPIN_SERVER_IMAGE)